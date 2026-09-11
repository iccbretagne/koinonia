"use client";

import { useState, useRef } from "react";
import Button from "@/components/ui/Button";

export interface AnnouncementSheetData {
  filename: string | null;
  uploadedAt: string | null;
  canDeposit: boolean;
  canRead: boolean;
}

interface Props {
  eventId: string;
  data: AnnouncementSheetData;
  onChange: (data: AnnouncementSheetData) => void;
  /** Retire la carte propre (fond, ombre, marge) quand le composant est inséré dans un
   * conteneur qui gère déjà cette présentation (ex. PreparationBanner, spec 043). */
  embedded?: boolean;
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
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
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
        alert(signBody.error || "Erreur");
        return;
      }

      const putRes = await fetch(signBody.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        alert("Échec du dépôt sur le stockage");
        return;
      }

      const confirmRes = await fetch(`/api/events/${eventId}/announcement-sheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: signBody.key, filename: file.name, mimeType: file.type }),
      });
      const confirmBody = await confirmRes.json();
      if (!confirmRes.ok) {
        alert(confirmBody.error || "Erreur");
        return;
      }

      onChange({
        ...data,
        filename: confirmBody.sheet.filename,
        uploadedAt: confirmBody.sheet.uploadedAt,
      });
    } catch {
      alert("Erreur");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (!confirm("Retirer la trame des annonces déposée ?")) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/events/${eventId}/announcement-sheet`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json();
        alert(body.error || "Erreur");
        return;
      }
      onChange({ ...data, filename: null, uploadedAt: null });
    } catch {
      alert("Erreur");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className={embedded ? "print:hidden" : "mb-6 p-4 bg-white rounded-lg shadow print:hidden"}>
      <h2 className={embedded ? "text-sm font-semibold text-gray-700 mb-3" : "text-lg font-semibold text-gray-900 mb-3"}>
        Trame des annonces
      </h2>

      {data.filename ? (
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-sm font-medium text-gray-700">{data.filename}</p>
            <p className="text-xs text-gray-400">
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
                {uploading ? "Dépôt..." : "Remplacer"}
              </Button>
              <Button variant="danger" size="sm" onClick={handleRemove} disabled={removing}>
                {removing ? "Retrait..." : "Retirer"}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-sm italic text-gray-400">Pas encore disponible</span>
          {data.canDeposit && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Dépôt..." : "Déposer"}
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
    </div>
  );
}
