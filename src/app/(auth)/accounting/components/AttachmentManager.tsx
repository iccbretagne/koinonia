"use client";

import { useState, useRef } from "react";

export interface AttachmentItem {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface Props {
  attachments: AttachmentItem[];
  requestId?: string;     // undefined → pré-upload avant création
  canUpload?: boolean;
  canDelete?: boolean;
  onChange?: (attachments: AttachmentItem[]) => void; // called after upload/delete
  className?: string;
}

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "application/pdf"];
const ALLOWED_EXT = ".jpg,.jpeg,.png,.pdf";

function fmtSize(b: number) {
  return b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} Ko` : `${(b / 1024 / 1024).toFixed(1)} Mo`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === "application/pdf") {
    return (
      <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM9.5 17.5c-.3 0-.5-.2-.5-.5V13h-.5c-.3 0-.5-.2-.5-.5s.2-.5.5-.5H9v-.5c0-.8.7-1.5 1.5-1.5s1.5.7 1.5 1.5V12h.5c.3 0 .5.2.5.5s-.2.5-.5.5H12v4c0 .3-.2.5-.5.5h-2zm1-5v4h1v-4h-1z"/>
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

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
      if (!ALLOWED.includes(file.type)) {
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
    finally { setDeletingId(null); }
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

  // Drag-and-drop handlers
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); }

  return (
    <div className={`space-y-2 ${className}`}>

      {/* Liste */}
      {attachments.length > 0 && (
        <div className="space-y-1.5">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
            >
              <FileIcon mimeType={a.mimeType} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{a.filename}</p>
                <p className="text-xs text-gray-400">{fmtSize(a.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => handleDownload(a.id, a.filename)}
                title="Télécharger"
                className="shrink-0 p-1.5 text-gray-400 hover:text-icc-violet transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  disabled={deletingId === a.id}
                  title="Supprimer"
                  className="shrink-0 p-1.5 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
                >
                  {deletingId === a.id ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Zone d'upload */}
      {canUpload && (
        <>
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onClick={() => inputRef.current?.click()}
            className="relative flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 rounded-xl px-4 py-4 text-center cursor-pointer hover:border-icc-violet/40 hover:bg-icc-violet/[0.02] transition-colors"
          >
            {uploading ? (
              <div className="flex items-center gap-2 text-sm text-icc-violet">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Envoi en cours…
              </div>
            ) : (
              <>
                <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <p className="text-sm text-gray-500">
                  <span className="font-medium text-icc-violet">Cliquer</span> ou glisser-déposer
                </p>
                <p className="text-xs text-gray-400">JPEG, PNG, PDF · max 5 Mo</p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept={ALLOWED_EXT}
              multiple
              className="sr-only"
              onChange={(e) => handleFiles(e.target.files)}
              disabled={uploading}
            />
          </div>
          {uploadError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{uploadError}</p>
          )}
        </>
      )}

      {attachments.length === 0 && !canUpload && (
        <p className="text-sm text-gray-400 italic">Aucune pièce jointe.</p>
      )}
    </div>
  );
}
