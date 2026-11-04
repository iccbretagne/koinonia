"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { defaultStore, deviceId as loadDeviceId, opQueue } from "@/lib/offline/store";
import type { SyncOp } from "@/modules/ticketing/schemas";

export interface FieldStatus {
  online: boolean;
  pending: number;
  lastSync: string | null;
  error: string | null;
}

/**
 * Moteur des écrans de terrain (spec 074, ADR-0026) : instantané en cache (IndexedDB), file
 * d'opérations locale, synchronisation toutes les 5 s et à chaque ajout quand le réseau est là.
 * L'écran reste utilisable hors ligne avec le dernier instantané.
 */
export function useFieldSync<S>(eventId: string, kind: "reception" | "catering", onSynced?: (counts: unknown) => void) {
  const storeRef = useRef(defaultStore());
  const queue = useRef(opQueue<SyncOp>(storeRef.current, `${eventId}:${kind}`));
  const syncing = useRef(false);
  const [snapshot, setSnapshot] = useState<S | null>(null);
  const [status, setStatus] = useState<FieldStatus>({ online: true, pending: 0, lastSync: null, error: null });
  const snapshotKey = `snapshot:${eventId}:${kind}`;

  const refreshSnapshot = useCallback(async () => {
    try {
      const res = await fetch(`/api/ticketing/events/${eventId}/snapshot?for=${kind}`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Instantané indisponible");
      const data = (await res.json()) as S;
      await storeRef.current.set(snapshotKey, data);
      setSnapshot(data);
      setStatus((s) => ({ ...s, online: true, lastSync: new Date().toISOString(), error: null }));
    } catch (error) {
      const cached = await storeRef.current.get<S>(snapshotKey);
      if (cached) setSnapshot((current) => current ?? cached);
      setStatus((s) => ({ ...s, online: navigator.onLine && !(error instanceof TypeError), error: error instanceof TypeError ? null : (error as Error).message }));
    }
  }, [eventId, kind, snapshotKey]);

  const flush = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const ops = await queue.current.pending();
      setStatus((s) => ({ ...s, pending: ops.length }));
      if (ops.length === 0) return;
      const device = await loadDeviceId(storeRef.current);
      const res = await fetch(`/api/ticketing/events/${eventId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: device, clientTime: new Date().toISOString(), ops: ops.slice(0, 200) }),
      });
      if (!res.ok) {
        setStatus((s) => ({ ...s, online: true, error: "Synchronisation refusée : réessai automatique." }));
        return;
      }
      const data = (await res.json()) as { results: { id: string }[]; counts: unknown };
      await queue.current.remove(data.results.map((r) => r.id));
      const left = await queue.current.count();
      setStatus((s) => ({ ...s, online: true, pending: left, lastSync: new Date().toISOString(), error: null }));
      onSynced?.(data.counts);
    } catch {
      setStatus((s) => ({ ...s, online: false }));
    } finally {
      syncing.current = false;
    }
  }, [eventId, onSynced]);

  useEffect(() => {
    void (async () => {
      const cached = await storeRef.current.get<S>(snapshotKey);
      if (cached) setSnapshot(cached);
      setStatus((s) => ({ ...s, online: navigator.onLine }));
      await flush();
      await refreshSnapshot();
    })();
    let ticks = 0;
    const timer = setInterval(async () => {
      ticks++;
      await flush();
      // Instantané rafraîchi toutes les 30 s quand la file est vide.
      if (ticks % 6 === 0 && (await queue.current.count()) === 0) await refreshSnapshot();
    }, 5000);
    const goOnline = () => {
      setStatus((s) => ({ ...s, online: true }));
      void flush();
    };
    const goOffline = () => setStatus((s) => ({ ...s, online: false }));
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- montage seul
  }, []);

  const enqueue = useCallback(
    async (op: SyncOp) => {
      await queue.current.push(op);
      setStatus((s) => ({ ...s, pending: s.pending + 1 }));
      void flush();
    },
    [flush]
  );

  return { snapshot, setSnapshot, status, enqueue, refreshSnapshot, flush };
}
