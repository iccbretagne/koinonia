"use client";

import { Download, Eye, FileText, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { useState, useRef } from "react";
import { IconButton } from "@/components/ui";

export interface AttachmentItem {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface Props {
  readonly attachments: AttachmentItem[];
  readonly requestId?: string;     // undefined → pré-upload avant création
  readonly canUpload?: boolean;
  readonly canDelete?: boolean;
  readonly onChange?: (attachments: AttachmentItem[]) => void; // called after upload/delete
  readonly className?: string;
}

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "application/pdf"]);
const ALLOWED_EXT = ".jpg,.jpeg,.png,.pdf";

function fmtSize(b: number) {
  return b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} Ko` : `${(b / 1024 / 1024).toFixed(1)} Mo`;
}

function FileIcon({ mimeType }: { readonly mimeType: string }) {
  if (mimeType === "application/pdf") {
    return (
      <FileText className="w-5 h-5 text-danger" aria-hidden="true" />
    );
  }
  return (
    <ImageIcon className="w-5 h-5 text-info" aria-hidden="true" />
  );
}

async function handleDownload(id: string, filename: string) {
  try {
    const res = await fetch(`/api/accounting/attachments/${id}`);
    if (!res.ok) return;
    const { url } = await res.json();
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    a.click();
  } catch { /* silent */ }
}

/**
 * Affiche la pièce dans un nouvel onglet, sans la télécharger (spec 089). L'onglet est ouvert avant
 * l'appel, pendant le clic : ouvert après une attente, il serait bloqué par le navigateur.
 */
async function handleView(id: string) {
  const tab = window.open("", "_blank");
  try {
    const res = await fetch(`/api/accounting/attachments/${id}?inline=1`);
    if (!res.ok) { tab?.close(); return; }
    const { url } = await res.json();
    if (tab) { tab.opener = null; tab.location.href = url; }
    else window.open(url, "_blank", "noopener");
  } catch { tab?.close(); }
}

function onDragOver(e: React.DragEvent) { e.preventDefault(); }

export default function AttachmentManager({
  attachments: initialAttachments,
  requestId,
  canUpload = false,
  canDelete = false,
  onChange,
  className = "",
}: Props) {
  const [attachments, setAttachments] = useState<AttachmentItem[]>(initialAttachments);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadError(null);

    for (const file of Array.from(files)) {
      if (!ALLOWED.has(file.type)) {
        setUploadError(`"${file.name}" : format non supporté (JPEG, PNG, PDF uniquement)`);
        return;
      }
      if (file.size > MAX_SIZE) {
        setUploadError(`"${file.name}" : fichier trop volumineux (max 5 Mo)`);
        return;
      }
    }

    setUploading(true);
    try {
      const newItems: AttachmentItem[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        if (requestId) fd.append("requestId", requestId);

        const res = await fetch("/api/accounting/attachments", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) { setUploadError(json.error ?? "Erreur lors de l'upload"); setUploading(false); return; }
        newItems.push(json as AttachmentItem);
      }
      const updated = [...attachments, ...newItems];
      setAttachments(updated);
      onChange?.(updated);
    } catch { setUploadError("Erreur réseau"); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer définitivement cette pièce jointe ?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/accounting/attachments/${id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); setUploadError(j.error ?? "Erreur de suppression"); return; }
      const updated = attachments.filter((a) => a.id !== id);
      setAttachments(updated);
      onChange?.(updated);
    } catch { setUploadError("Erreur réseau"); }
    finally { setDeletingId(null); }
  }

  // Drag-and-drop handlers
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    void handleFiles(e.dataTransfer.files);
  }

  return (
    <div className={`space-y-2 ${className}`}>

      {/* Liste */}
      {attachments.length > 0 && (
        <div className="space-y-1.5">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 bg-surface-sunken border border-line rounded-lg px-3 py-2"
            >
              <FileIcon mimeType={a.mimeType} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink truncate">{a.filename}</p>
                <p className="text-xs text-ink-subtle">{fmtSize(a.size)}</p>
              </div>
              <IconButton size="sm" icon={Eye} aria-label={`Voir ${a.filename}`} title="Voir" onClick={() => handleView(a.id)} />
              <IconButton size="sm" icon={Download} aria-label={`Télécharger ${a.filename}`} title="Télécharger" onClick={() => handleDownload(a.id, a.filename)} />
              {canDelete && (
                <IconButton
                  size="sm"
                  aria-label={`Supprimer ${a.filename}`}
                  title="Supprimer"
                  onClick={() => handleDelete(a.id)}
                  disabled={deletingId === a.id}
                  className="hover:text-danger"
                >
                  {deletingId === a.id ? (
                    <Loader2 className="size-5 animate-spin" aria-hidden="true" strokeWidth={1.75} />
                  ) : (
                    <X className="size-5" aria-hidden="true" strokeWidth={1.75} />
                  )}
                </IconButton>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Zone d'upload */}
      {canUpload && (
        <>
          <button
            type="button"
            onDrop={onDrop}
            onDragOver={onDragOver}
            onClick={() => inputRef.current?.click()}
            className="relative w-full flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-line rounded-xl px-4 py-4 text-center cursor-pointer hover:border-brand/40 hover:bg-brand-hover/[0.02] focus-visible:ring-2 focus-visible:ring-focus outline-none transition-colors"
          >
            {uploading ? (
              <div className="flex items-center gap-2 text-sm text-brand-text">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                Envoi en cours…
              </div>
            ) : (
              <>
                <Upload className="w-6 h-6 text-ink-subtle" aria-hidden="true" />
                <p className="text-sm text-ink-muted">
                  <span className="font-medium text-brand-text">Cliquer</span> ou glisser-déposer
                </p>
                <p className="text-xs text-ink-subtle">JPEG, PNG, PDF · max 5 Mo</p>
              </>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_EXT}
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => handleFiles(e.target.files)}
            disabled={uploading}
          />
          {uploadError && (
            <p className="text-xs text-danger bg-danger-soft border border-danger/30 rounded-lg px-3 py-2">{uploadError}</p>
          )}
        </>
      )}

      {attachments.length === 0 && !canUpload && (
        <p className="text-sm text-ink-subtle italic">Aucune pièce jointe.</p>
      )}
    </div>
  );
}
