"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

export interface PublishSegmentSummary {
  id: string;
  title: string;
  hasRendition: boolean;
  lufs: number | null;
  truePeakDb: number | null;
}

const TARGET_LUFS = -16;
const TRUE_PEAK_ALERT_DB = -1;
const LUFS_DEVIATION_ALERT = 1;

function isFlagged(segment: PublishSegmentSummary): boolean {
  if (segment.truePeakDb != null && segment.truePeakDb > TRUE_PEAK_ALERT_DB) return true;
  if (segment.lufs != null && Math.abs(segment.lufs - TARGET_LUFS) > LUFS_DEVIATION_ALERT) return true;
  return false;
}

export default function PublishModal({
  serviceId,
  open,
  onClose,
  segments,
  action,
}: {
  serviceId: string;
  open: boolean;
  onClose: () => void;
  segments: PublishSegmentSummary[];
  action: "publish" | "unpublish";
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/audio/services/${serviceId}/${action}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Échec de l'opération");
      }
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={action === "publish" ? "Publier ce culte" : "Dépublier ce culte"}>
      {action === "publish" ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            {segments.length} séquence{segments.length > 1 ? "s" : ""} seront publiées. Le rendu (niveau sonore
            normalisé à −16 LUFS) est calculé après publication pour toute séquence nouvelle ou modifiée — une
            republication sans nouveau dépôt ne relance aucun rendu.
          </p>
          <ul className="divide-y divide-gray-200 border-2 border-gray-200 rounded-lg">
            {segments.map((seg) => (
              <li key={seg.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-gray-900">{seg.title}</span>
                {seg.hasRendition ? (
                  <span className={isFlagged(seg) ? "text-icc-rouge font-medium" : "text-gray-500"}>
                    {seg.lufs?.toFixed(1)} LUFS · crête {seg.truePeakDb?.toFixed(1)} dB
                    {isFlagged(seg) && " ⚠"}
                  </span>
                ) : (
                  <span className="text-gray-400">rendu à calculer</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-gray-600">
          Le lien public déjà partagé deviendra inopérant. Vous pourrez republier ce culte à tout moment sans
          redéposer les séquences déjà validées.
        </p>
      )}

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Annuler
        </Button>
        <Button variant={action === "unpublish" ? "danger" : "primary"} onClick={confirm} disabled={submitting}>
          {submitting ? "…" : action === "publish" ? "Publier" : "Dépublier"}
        </Button>
      </div>
    </Modal>
  );
}
