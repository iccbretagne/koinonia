"use client";

import { useState, useRef } from "react";
import Button from "@/components/ui/Button";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";

export interface AnnouncementSheetData {
  filename: string | null;
  uploadedAt: string | null;
  canDeposit: boolean;
  canRead: boolean;
}

interface Props {
  readonly eventId: string;
  readonly data: AnnouncementSheetData;
  readonly onChange: (data: AnnouncementSheetData) => void;
  /** Retire la carte propre (fond, ombre, marge) quand le composant est inséré dans un
   * conteneur qui gère déjà cette présentation (ex. PreparationBanner, spec 043). */
  readonly embedded?: boolean;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AnnouncementSheetManager({ eventId, data, onChange, embedded = false }: Props) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!data.canDeposit && !data.canRead) return null;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const signRes = await fetch(`/api/events/${eventId}/announcement-sheet/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, size: file.size }),
      });
      const signBody = await signRes.json();
      if (!signRes.ok) {
        toast.error(signBody.error || "Dépôt impossible. Réessayez dans un instant.");
        return;
      }

      const putRes = await fetch(signBody.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        toast.error("Échec du dépôt sur le stockage. Réessayez dans un instant.");
        return;
      }

      const confirmRes = await fetch(`/api/events/${eventId}/announcement-sheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: signBody.key, filename: file.name, mimeType: file.type }),
      });
      const confirmBody = await confirmRes.json();
      if (!confirmRes.ok) {
        toast.error(confirmBody.error || "Dépôt impossible. Réessayez dans un instant.");
        return;
      }

      onChange({
        ...data,
        filename: confirmBody.sheet.filename,
        uploadedAt: confirmBody.sheet.uploadedAt,
      });
      toast.success("Trame déposée");
    } catch {
      toast.error("Opération impossible. Vérifiez votre connexion.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      const res = await fetch(`/api/events/${eventId}/announcement-sheet`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json();
        toast.error(body.error || "Retrait impossible. Réessayez dans un instant.");
        return;
      }
      onChange({ ...data, filename: null, uploadedAt: null });
      toast.success("Trame retirée");
    } catch {
      toast.error("Opération impossible. Vérifiez votre connexion.");
    } finally {
      setRemoving(false);
      setConfirmRemove(false);
    }
  }

  return (
    <div className={embedded ? "print:hidden" : "mb-6 rounded-card border border-line bg-surface p-4 print:hidden"}>
      <h2 className={embedded ? "mb-3 font-display text-sm font-semibold text-ink" : "mb-3 font-display text-lg font-semibold text-ink"}>
        Trame des annonces
      </h2>

      {data.filename ? (
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-sm font-medium text-ink">{data.filename}</p>
            <p className="text-xs text-ink-muted">
              Déposée le {data.uploadedAt ? formatDate(data.uploadedAt) : ""}
            </p>
          </div>
          {data.canDeposit && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? "Dépôt…" : "Remplacer"}
              </Button>
              <Button variant="danger" size="sm" onClick={() => setConfirmRemove(true)} disabled={removing}>
                {removing ? "Retrait…" : "Retirer"}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-sm italic text-ink-muted">Pas encore disponible</span>
          {data.canDeposit && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Dépôt…" : "Déposer"}
            </Button>
          )}
        </div>
      )}

      {data.canDeposit && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileChange}
          className="hidden"
        />
      )}
      <ConfirmModal
        open={confirmRemove}
        title="Retirer la trame des annonces ?"
        message="Le fichier déposé ne sera plus téléchargeable pour ce culte."
        confirmLabel="Retirer la trame"
        confirmingLabel="Retrait…"
        variant="danger"
        confirming={removing}
        onConfirm={handleRemove}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
