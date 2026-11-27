"use client";

import { Download, Eye, FileText, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { useState, useRef } from "react";
import { Alert, ConfirmModal, IconButton } from "@/components/ui";

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
  const Icon = mimeType === "application/pdf" ? FileText : ImageIcon;
  return <Icon className="size-5 shrink-0 text-ink-muted" aria-hidden="true" strokeWidth={1.75} />;
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
  const [pendingDelete, setPendingDelete] = useState<AttachmentItem | null>(null);
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
    setDeletingId(id);
    try {
      const res = await fetch(`/api/accounting/attachments/${id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); setUploadError(j.error ?? "Erreur de suppression"); return; }
      const updated = attachments.filter((a) => a.id !== id);
      setAttachments(updated);
      onChange?.(updated);
    } catch { setUploadError("Erreur réseau"); }
    finally { setDeletingId(null); setPendingDelete(null); }
  }

  // Drag-and-drop handlers
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    void handleFiles(e.dataTransfer.files);
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>

      {/* Liste */}
      {attachments.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-1 rounded-control border border-line py-1 pl-3 pr-1"
            >
              <FileIcon mimeType={a.mimeType} />
              <div className="ml-1 min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold leading-[22px] text-ink">{a.filename}</p>
                <p className="text-[13px] leading-[18px] text-ink-subtle">{fmtSize(a.size)}</p>
              </div>
              <IconButton icon={Eye} aria-label={`Voir ${a.filename}`} title="Voir" onClick={() => handleView(a.id)} />
              <IconButton icon={Download} aria-label={`Télécharger ${a.filename}`} title="Télécharger" onClick={() => handleDownload(a.id, a.filename)} />
              {canDelete && (
                <IconButton
                  aria-label={`Supprimer ${a.filename}`}
                  title="Supprimer"
                  onClick={() => setPendingDelete(a)}
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
            </li>
          ))}
        </ul>
      )}

      {/* Zone d'upload */}
      {canUpload && (
        <>
          <button
            type="button"
            onDrop={onDrop}
            onDragOver={onDragOver}
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="relative flex min-h-11 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-control-line px-4 py-4 text-center transition-colors duration-120 hover:border-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed"
          >
            {uploading ? (
              <span className="flex items-center gap-2 text-[15px] text-ink-muted" aria-live="polite">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" strokeWidth={1.75} />
                Envoi en cours…
              </span>
            ) : (
              <>
                <Upload className="size-6 text-ink-subtle" aria-hidden="true" strokeWidth={1.75} />
                <span className="font-display text-sm font-semibold text-brand-text">Ajouter une pièce jointe</span>
                <span className="text-[13px] leading-[18px] text-ink-muted">Choisir un fichier ou le glisser ici · JPEG, PNG, PDF · 5 Mo maximum</span>
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
        </>
      )}

      {uploadError && <Alert tone="danger" role="alert">{uploadError}</Alert>}

      {attachments.length === 0 && !canUpload && (
        <p className="text-[15px] leading-[22px] text-ink-muted">Aucune pièce jointe.</p>
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        title={`Supprimer « ${pendingDelete?.filename ?? ""} » ?`}
        message="La pièce jointe est supprimée définitivement."
        confirmLabel="Supprimer la pièce jointe"
        confirmingLabel="Suppression…"
        confirming={deletingId !== null}
        onConfirm={() => pendingDelete && handleDelete(pendingDelete.id)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
