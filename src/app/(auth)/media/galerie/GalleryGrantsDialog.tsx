"use client";

import { useEffect, useId, useState } from "react";
import Modal from "@/components/ui/Modal";
import ConfirmModal from "@/components/ui/ConfirmModal";
import Button from "@/components/ui/Button";
import { Input, SearchInput, fieldLabelClasses } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

interface Grant {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  expiresAt: string | null;
  expired: boolean;
  grantedBy: string | null;
}

interface Candidate {
  id: string;
  name: string | null;
  email: string | null;
}

const dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

/** Fin de journée locale d'une date `AAAA-MM-JJ`, en ISO (null si vide). */
const endOfDay = (d: string) => (d ? new Date(`${d}T23:59:59`).toISOString() : null);
const toDayInput = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }) : "");
const tomorrow = () => new Date(Date.now() + 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

/**
 * Accès nominatifs à la galerie (spec 080) : lecture et téléchargement, sans partage, avec une
 * date de fin facultative. Réservé à l'Admin et au Ministre des équipes média.
 */
export default function GalleryGrantsDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const uid = useId();
  const toast = useToast();
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Grant | null>(null);

  async function reload() {
    const res = await fetch("/api/media/library/grants");
    setGrants(res.ok ? await res.json() : []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement à l'ouverture
    if (open) void reload();
  }, [open]);

  useEffect(() => {
    if (picked || q.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- liste vidée sous 2 caractères
      setCandidates([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/media/library/grants/users?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then(setCandidates)
        .catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, picked]);

  async function save(body: { userId: string; expiresAt: string | null }, method: "POST" | "PATCH", id?: string) {
    setBusy(true);
    try {
      const res = await fetch(id ? `/api/media/library/grants/${id}` : "/api/media/library/grants", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(method === "POST" ? body : { expiresAt: body.expiresAt }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Enregistrement impossible");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!picked) return;
    if (await save({ userId: picked.id, expiresAt: endOfDay(until) }, "POST")) {
      toast.success(`Accès donné à ${picked.name ?? picked.email ?? "ce compte"}`);
      setPicked(null);
      setQ("");
      setUntil("");
      void reload();
    }
  }

  async function changeEnd(g: Grant, day: string) {
    if (await save({ userId: g.userId, expiresAt: endOfDay(day) }, "PATCH", g.id)) await reload();
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    const res = await fetch(`/api/media/library/grants/${removing.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) toast.success("Accès retiré");
    else toast.error("Retrait impossible");
    setRemoving(null);
    await reload();
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Accès à la galerie" size="lg">
        <div className="space-y-5">
          <p className="text-sm text-ink-muted">
            Ouvrez la galerie à une personne précise : elle peut parcourir et télécharger, sans partager ni modifier.
            Les équipes Photos, Production Média et Communication y ont déjà accès.
          </p>

          <div className="rounded-card border border-line p-4 space-y-3">
            <h3 className="font-display text-[15px] font-semibold text-ink">Donner un accès</h3>
            {picked ? (
              <div className="flex items-center justify-between gap-2 rounded-control bg-brand-soft py-1 pl-3 pr-1">
                <span className="text-sm text-ink truncate">{picked.name ?? picked.email}</span>
                <Button type="button" variant="ghost" size="sm" className="min-h-11 shrink-0 sm:min-h-9" onClick={() => setPicked(null)}>Changer de personne</Button>
              </div>
            ) : (
              <div>
                <label htmlFor={`${uid}-q`} className={`${fieldLabelClasses} mb-1.5 block`}>Personne (compte de l&apos;église)</label>
                <SearchInput id={`${uid}-q`} aria-label="Personne (compte de l'église)" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou email" />
                {candidates.length > 0 && (
                  <ul className="mt-1 border border-line rounded-control divide-y divide-line bg-surface overflow-hidden">
                    {candidates.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => setPicked(c)} className="w-full min-h-11 text-left px-3 py-2 text-sm hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus">
                          <span className="text-ink">{c.name ?? c.email}</span>
                          {c.name !== null && c.email !== null && <span className="block text-xs text-ink-subtle">{c.email}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Input label="Jusqu'au (facultatif)" type="date" min={tomorrow()} value={until} onChange={(e) => setUntil(e.target.value)} />
              </div>
              <Button variant="primary" onClick={add} disabled={!picked || busy}>
                {busy ? "Enregistrement en cours…" : "Donner l'accès"}
              </Button>
            </div>
          </div>

          <div>
            <h3 className="font-display text-[15px] font-semibold text-ink mb-2">Accès donnés</h3>
            {grants === null ? (
              <p className="text-sm text-ink-subtle">Chargement…</p>
            ) : grants.length === 0 ? (
              <p className="text-sm text-ink-subtle">Aucun accès nominatif.</p>
            ) : (
              <ul className="border border-line rounded-card divide-y divide-line">
                {grants.map((g) => (
                  <li key={g.id} className="px-3 py-3 flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink truncate">{g.name ?? g.email}</p>
                      <p className={`text-xs ${g.expired ? "text-danger" : "text-ink-subtle"}`}>
                        {g.expired
                          ? `Expiré le ${dayFmt.format(new Date(g.expiresAt as string))}`
                          : g.expiresAt
                            ? `Jusqu'au ${dayFmt.format(new Date(g.expiresAt))}`
                            : "Sans date de fin"}
                        {g.grantedBy ? ` · donné par ${g.grantedBy}` : ""}
                      </p>
                    </div>
                    <div className="w-44">
                      <Input
                        aria-label={`Date de fin pour ${g.name ?? g.email}`}
                        type="date"
                        min={tomorrow()}
                        defaultValue={g.expired ? "" : toDayInput(g.expiresAt)}
                        onChange={(e) => {
                          if (e.target.value) void changeEnd(g, e.target.value);
                        }}
                      />
                    </div>
                    {g.expiresAt !== null && !g.expired && (
                      <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={() => changeEnd(g, "")} disabled={busy}>Retirer la date de fin</Button>
                    )}
                    <Button variant="secondary" size="sm" className="min-h-11 sm:min-h-9" onClick={() => setRemoving(g)} disabled={busy}>Retirer l&apos;accès</Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Modal>
      <ConfirmModal
        open={removing !== null}
        title="Retirer l'accès ?"
        message={`${removing?.name ?? removing?.email ?? "Cette personne"} ne verra plus la galerie, immédiatement.`}
        confirmLabel="Retirer l'accès"
        confirmingLabel="Retrait en cours…"
        variant="danger"
        confirming={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}
