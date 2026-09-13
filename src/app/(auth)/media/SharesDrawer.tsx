"use client";

import { useEffect, useState, useCallback } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

interface ShareSource {
  type: "event" | "project";
  id: string;
  name: string;
}

interface ActiveShare {
  id: string;
  type: string;
  label: string | null;
  url: string;
  expiresAt: string | null;
  createdAt: string;
  usageCount: number;
  sources: ShareSource[];
  canRevoke: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  VALIDATOR: "Validation",
  MEDIA: "Téléchargement",
  MEDIA_ALL: "Téléchargement (tout)",
  PREVALIDATOR: "Prévalidation",
  GALLERY: "Galerie",
  COLLECTION: "Partages",
};

/** Tiroir listant les liens de partage actifs (spec 049) — remplace l'écran « Collections ». */
export default function SharesDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [shares, setShares] = useState<ActiveShare[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/media/shares");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur de chargement");
      setShares(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function handleRevoke(id: string) {
    if (!confirm("Révoquer ce lien de partage ? Il ne sera plus accessible.")) return;
    setRevokingId(id);
    try {
      const res = await fetch(`/api/media/shares/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Erreur lors de la révocation");
      }
      setShares((prev) => prev?.filter((s) => s.id !== id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la révocation");
    } finally {
      setRevokingId(null);
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // best-effort
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Partages actifs">
      {error && <p className="text-icc-rouge text-sm mb-3">{error}</p>}
      {shares === null && !error && <p className="text-gray-500 text-sm">Chargement…</p>}
      {shares?.length === 0 && <p className="text-gray-500 text-sm">Aucun lien de partage actif.</p>}
      <ul className="flex flex-col gap-3">
        {shares?.map((share) => (
          <li key={share.id} className="border-2 border-gray-200 rounded-lg p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm text-gray-900">
                {share.label || TYPE_LABELS[share.type] || share.type}
              </span>
              <span className="text-xs text-gray-500">{share.usageCount} utilisation(s)</span>
            </div>
            <p className="text-xs text-gray-500">
              {share.sources.map((s) => s.name).join(", ") || "Sources indisponibles"}
            </p>
            {share.expiresAt && (
              <p className="text-xs text-gray-500">
                Expire le {new Date(share.expiresAt).toLocaleDateString("fr-FR")}
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => copyLink(share.url)}>
                Copier le lien
              </Button>
              {share.canRevoke && (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={revokingId === share.id}
                  onClick={() => handleRevoke(share.id)}
                >
                  Révoquer
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
