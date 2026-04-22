"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import type { MediaFileStatus, MediaFileType, MediaTokenType } from "@/generated/prisma/enums";

// ─── Types ────────────────────────────────────────────────────────────────────

type FileVersion = {
  id: string;
  versionNumber: number;
  originalKey: string;
  thumbnailKey: string;
  notes: string | null;
  createdAt: Date;
  streamUrl?: string | null;
  createdBy?: { id: string; name: string | null; displayName: string | null };
};

type Comment = {
  id: string;
  type: "GENERAL" | "TIMECODE";
  content: string;
  timecode: number | null;
  parentId: string | null;
  authorName: string | null;
  authorImage: string | null;
  createdAt: Date;
  author: { id: string; name: string | null; displayName: string | null } | null;
  replies?: Comment[];
};

type MediaFile = {
  id: string;
  type: MediaFileType;
  status: MediaFileStatus;
  filename: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  createdAt: Date;
  updatedAt: Date;
  versions: FileVersion[];
};

type ShareToken = {
  id: string;
  token: string;
  type: MediaTokenType;
  label: string | null;
  expiresAt: Date | null;
  usageCount: number;
  createdAt: Date;
};

type MediaProject = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  createdBy: { id: string; name: string | null; displayName: string | null };
  files: MediaFile[];
  shareTokens: ShareToken[];
  _count: { files: number };
};

// ─── Constantes ───────────────────────────────────────────────────────────────

const FILE_STATUS_LABELS: Record<MediaFileStatus, string> = {
  PENDING:            "En attente",
  APPROVED:           "Approuvé",
  REJECTED:           "Rejeté",
  PREVALIDATED:       "Pré-validé",
  PREREJECTED:        "Pré-rejeté",
  DRAFT:              "Brouillon",
  IN_REVIEW:          "En révision",
  REVISION_REQUESTED: "Révision demandée",
  FINAL_APPROVED:     "Validé final",
};

const FILE_STATUS_COLORS: Record<MediaFileStatus, string> = {
  PENDING:            "bg-yellow-100 text-yellow-800",
  APPROVED:           "bg-green-100 text-green-800",
  REJECTED:           "bg-red-100 text-red-800",
  PREVALIDATED:       "bg-blue-100 text-blue-800",
  PREREJECTED:        "bg-orange-100 text-orange-800",
  DRAFT:              "bg-gray-100 text-gray-700",
  IN_REVIEW:          "bg-purple-100 text-purple-800",
  REVISION_REQUESTED: "bg-amber-100 text-amber-800",
  FINAL_APPROVED:     "bg-emerald-100 text-emerald-800",
};

const FILE_STATUS_DOT: Record<MediaFileStatus, string> = {
  PENDING:            "bg-yellow-400",
  APPROVED:           "bg-green-500",
  REJECTED:           "bg-red-500",
  PREVALIDATED:       "bg-blue-500",
  PREREJECTED:        "bg-orange-500",
  DRAFT:              "bg-gray-400",
  IN_REVIEW:          "bg-purple-500",
  REVISION_REQUESTED: "bg-amber-500",
  FINAL_APPROVED:     "bg-emerald-500",
};

const FILE_TYPE_LABELS: Record<MediaFileType, string> = {
  PHOTO:  "Photo",
  VISUAL: "Visuel",
  VIDEO:  "Vidéo",
};

const TOKEN_TYPE_LABELS: Record<MediaTokenType, string> = {
  VALIDATOR:    "Validateur",
  PREVALIDATOR: "Pré-validateur",
  MEDIA:        "Téléchargement",
  GALLERY:      "Galerie",
};

const TOKEN_TYPE_ICONS: Record<MediaTokenType, string> = {
  VALIDATOR:    "✅",
  PREVALIDATOR: "👁",
  MEDIA:        "⬇️",
  GALLERY:      "🖼️",
};

const ALLOWED_TYPES: Record<string, MediaFileType> = {
  "video/mp4": "VIDEO", "video/quicktime": "VIDEO", "video/webm": "VIDEO",
  "image/jpeg": "VISUAL", "image/png": "VISUAL", "image/webp": "VISUAL",
  "image/svg+xml": "VISUAL", "application/pdf": "VISUAL",
};

// Statuts qui comptent comme "traités" pour la barre de progression
const DONE_STATUSES: MediaFileStatus[] = ["FINAL_APPROVED", "REJECTED"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(d: Date) {
  return new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}min${sec > 0 ? ` ${sec}s` : ""}` : `${sec}s`;
}

function formatTimecode(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// ─── Modale de confirmation ───────────────────────────────────────────────────

function ConfirmModal({ title, message, confirmLabel = "Confirmer", danger = false, onConfirm, onCancel }: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${danger ? "bg-red-100" : "bg-gray-100"}`}>
            {danger ? (
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{title}</p>
            <p className="text-sm text-gray-500 mt-0.5">{message}</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 hover:border-gray-300 rounded-xl transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-xl transition-colors ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-icc-violet hover:bg-icc-violet/90"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Liens de partage ─────────────────────────────────────────────────────────

function ShareTokenSection({ projectId, tokens, onRefresh }: {
  projectId: string;
  tokens: ShareToken[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newType, setNewType] = useState<MediaTokenType>("GALLERY");
  const [newLabel, setNewLabel] = useState("");
  const [newExpiry, setNewExpiry] = useState("7");
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [pendingDeleteToken, setPendingDeleteToken] = useState<string | null>(null);
  useEffect(() => { setOrigin(window.location.origin); }, []);

  async function createToken() {
    setError(null);
    setCreating(true);
    try {
      const res = await fetch(`/api/media-projects/${projectId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: newType,
          label: newLabel || null,
          expiresInDays: newExpiry && parseInt(newExpiry, 10) > 0 ? parseInt(newExpiry, 10) : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      setNewLabel("");
      setNewExpiry("7");
      setOpen(false);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setCreating(false);
    }
  }

  async function deleteToken(tokenId: string) {
    setPendingDeleteToken(null);
    await fetch(`/api/media-projects/${projectId}/share?tokenId=${tokenId}`, { method: "DELETE" });
    onRefresh();
  }

  function getTokenUrl(token: ShareToken) {
    const paths: Record<MediaTokenType, string> = { VALIDATOR: "v", PREVALIDATOR: "v", MEDIA: "d", GALLERY: "g" };
    return `${origin}/media/${paths[token.type]}/${token.token}`;
  }

  async function copy(url: string, id: string) {
    await navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <>
      <div className="space-y-3">
        {tokens.length === 0 && !open && (
          <p className="text-sm text-gray-400 text-center py-2">Aucun lien de partage</p>
        )}

        {tokens.map((token) => {
          const url = getTokenUrl(token);
          const isExpired = token.expiresAt && new Date(token.expiresAt) < new Date();
          return (
            <div key={token.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${isExpired ? "bg-red-50 border-red-200 opacity-70" : "bg-gray-50 border-gray-200"}`}>
              <span className="text-lg shrink-0">{TOKEN_TYPE_ICONS[token.type]}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-gray-700">{TOKEN_TYPE_LABELS[token.type]}</span>
                  {token.label && <span className="text-xs text-gray-500">{token.label}</span>}
                  {isExpired && <span className="text-xs text-red-600 font-medium">Expiré</span>}
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate font-mono">{url}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {token.usageCount} usage{token.usageCount > 1 ? "s" : ""}
                  {token.expiresAt && ` · expire le ${formatDate(token.expiresAt)}`}
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => copy(url, token.id)}
                  className={`text-xs border rounded-lg px-2.5 py-1.5 transition-colors ${copied === token.id ? "bg-green-50 border-green-200 text-green-700" : "border-gray-200 text-gray-500 hover:text-icc-violet hover:border-icc-violet"}`}
                >
                  {copied === token.id ? "✓ Copié" : "Copier"}
                </button>
                <button
                  onClick={() => setPendingDeleteToken(token.id)}
                  className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:bg-red-50 rounded-lg px-2.5 py-1.5 transition-colors"
                >
                  Suppr.
                </button>
              </div>
            </div>
          );
        })}

        {open ? (
          <div className="p-4 border-2 border-icc-violet/30 rounded-xl bg-icc-violet/5 space-y-3">
            <p className="text-sm font-medium text-gray-700">Nouveau lien de partage</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as MediaTokenType)}
                  className="w-full border-2 border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet bg-white"
                >
                  {(Object.keys(TOKEN_TYPE_LABELS) as MediaTokenType[]).map((t) => (
                    <option key={t} value={t}>{TOKEN_TYPE_ICONS[t]} {TOKEN_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Durée (0 = illimité)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    value={newExpiry}
                    onChange={(e) => setNewExpiry(e.target.value)}
                    className="w-full border-2 border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">jours</span>
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Étiquette (optionnel)</label>
              <input
                type="text"
                placeholder="Ex : Révision client"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet"
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setOpen(false); setError(null); }} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">
                Annuler
              </button>
              <Button onClick={createToken} disabled={creating} size="sm">
                {creating ? "Création…" : "Créer le lien"}
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-2.5 text-sm text-gray-500 hover:border-icc-violet hover:text-icc-violet transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Ajouter un lien
          </button>
        )}
      </div>

      {pendingDeleteToken && (
        <ConfirmModal
          title="Supprimer ce lien ?"
          message="Les personnes ayant ce lien ne pourront plus y accéder."
          confirmLabel="Supprimer"
          danger
          onConfirm={() => deleteToken(pendingDeleteToken)}
          onCancel={() => setPendingDeleteToken(null)}
        />
      )}
    </>
  );
}

// ─── Video player avec gestion expiration ────────────────────────────────────

function VideoPlayer({ src, thumbnail, onExpired }: {
  src: string;
  thumbnail?: string;
  onExpired: () => void;
}) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-gray-400 p-4">
        {thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt="" className="absolute inset-0 w-full h-full object-contain opacity-20" />
        )}
        <p className="relative text-sm text-gray-300 text-center z-10">Impossible de lire la vidéo</p>
        <button
          onClick={() => { setError(false); onExpired(); }}
          className="relative z-10 text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          Recharger
        </button>
      </div>
    );
  }

  return (
    <video
      key={src}
      src={src}
      controls
      className="w-full h-full"
      preload="metadata"
      onError={() => setError(true)}
    />
  );
}

// ─── Upload vers S3 (presigned) ───────────────────────────────────────────────

async function uploadToS3(uploadUrl: string, file: File, onProgress?: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`S3 ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Erreur réseau"));
    xhr.send(file);
  });
}

// ─── Zone d'upload nouveaux fichiers ─────────────────────────────────────────

function FileUploadZone({ projectId, onUploaded, onActivityChange }: {
  projectId: string;
  onUploaded: () => void;
  onActivityChange?: (active: boolean, label?: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ file: string; pct: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: File[]) {
    const valid = files.filter((f) => ALLOWED_TYPES[f.type]);
    if (valid.length === 0) { setError("Format non supporté (MP4, MOV, WebM, JPEG, PNG, PDF)"); return; }
    setUploading(true);
    setError(null);
    const errors: string[] = [];

    for (const file of valid) {
      try {
        setProgress({ file: file.name, pct: 0 });
        onActivityChange?.(true, file.name);
        const signRes = await fetch("/api/media/files/upload/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            size: file.size,
            type: ALLOWED_TYPES[file.type],
            mediaProjectId: projectId,
          }),
        });
        const signJson = await signRes.json();
        if (!signRes.ok) throw new Error(signJson.error || "Erreur serveur");
        const { fileId, uploadUrl, key } = signJson.data;
        await uploadToS3(uploadUrl, file, (pct) => setProgress({ file: file.name, pct }));
        await fetch(`/api/media/files/${fileId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ originalKey: key }),
        });
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : "Erreur"}`);
      }
    }

    setUploading(false);
    setProgress(null);
    onActivityChange?.(false);
    if (errors.length > 0) setError(errors.join("\n"));
    onUploaded();
  }

  return (
    <div
      className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-icc-violet hover:bg-icc-violet/5 transition-all"
      onClick={() => inputRef.current?.click()}
      onDrop={(e) => { e.preventDefault(); handleFiles(Array.from(e.dataTransfer.files)); }}
      onDragOver={(e) => e.preventDefault()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp,image/svg+xml,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => { handleFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
      />
      {uploading && progress ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700 truncate">{progress.file}</p>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-icc-violet h-2 rounded-full transition-all" style={{ width: `${progress.pct}%` }} />
          </div>
          <p className="text-xs text-gray-500">{progress.pct}%</p>
        </div>
      ) : (
        <>
          <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <p className="text-sm text-gray-500">
            Glissez vos fichiers ici ou <span className="text-icc-violet font-medium">cliquez pour choisir</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">Vidéo (MP4, MOV, WebM) · Visuel (JPEG, PNG, WebP, SVG, PDF)</p>
        </>
      )}
      {error && <p className="mt-2 text-xs text-red-600 whitespace-pre-line">{error}</p>}
    </div>
  );
}

// ─── Upload nouvelle version ──────────────────────────────────────────────────

function NewVersionUpload({ fileId, onDone }: { fileId: string; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pct, setPct] = useState(0);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) { setPendingFile(f); setShowForm(true); }
    e.target.value = "";
  }

  async function upload() {
    if (!pendingFile) return;
    setUploading(true);
    setError(null);
    setPct(0);
    try {
      const res = await fetch(`/api/media/files/${fileId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: pendingFile.name, contentType: pendingFile.type, size: pendingFile.size, notes: notes || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      const { uploadUrl } = json;
      await uploadToS3(uploadUrl, pendingFile, setPct);
      setPendingFile(null);
      setNotes("");
      setShowForm(false);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <input ref={inputRef} type="file" className="hidden" onChange={onFileChange} />
      {!showForm ? (
        <button
          onClick={() => inputRef.current?.click()}
          className="text-xs text-icc-violet border border-icc-violet/30 rounded-lg px-2.5 py-1.5 hover:bg-icc-violet/5 transition-colors font-medium"
        >
          + Nouvelle version
        </button>
      ) : (
        <div className="mt-2 space-y-2 p-3 bg-icc-violet/5 rounded-lg border border-icc-violet/20">
          <p className="text-xs font-medium text-gray-700 truncate">{pendingFile?.name}</p>
          <input
            type="text"
            placeholder="Note (optionnel)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-icc-violet"
          />
          {uploading && (
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div className="bg-icc-violet h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={upload} disabled={uploading}
              className="text-xs bg-icc-violet text-white px-3 py-1 rounded-lg hover:bg-icc-violet/90 disabled:opacity-50 font-medium">
              {uploading ? `Upload ${pct}%…` : "Envoyer"}
            </button>
            <button onClick={() => { setShowForm(false); setPendingFile(null); }}
              className="text-xs text-gray-500 px-2 py-1 hover:text-gray-700">
              Annuler
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Panneau détail fichier ───────────────────────────────────────────────────

function FileDetailPanel({ file, thumbnailUrl, allFiles, fileIndex, onNavigate, canUpload, canReview, onClose, onReviewFile, onRefresh }: {
  file: MediaFile;
  thumbnailUrl: string | undefined;
  allFiles: MediaFile[];
  fileIndex: number;
  onNavigate: (file: MediaFile) => void;
  canUpload: boolean;
  canReview: boolean;
  onClose: () => void;
  onReviewFile: (id: string, status: "FINAL_APPROVED" | "REVISION_REQUESTED" | "REJECTED") => void;
  onRefresh: () => void;
}) {
  const [versions, setVersions] = useState<(FileVersion & { createdBy?: { name: string | null; displayName: string | null } })[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [loadingComments, setLoadingComments] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [activeTab, setActiveTab] = useState<"versions" | "comments">("versions");

  const hasPrev = fileIndex > 0;
  const hasNext = fileIndex < allFiles.length - 1;

  const loadVersions = useCallback(async () => {
    setLoadingVersions(true);
    try {
      const res = await fetch(`/api/media/files/${file.id}/versions`);
      const json = await res.json();
      if (res.ok) setVersions(Array.isArray(json.data) ? json.data : []);
    } finally {
      setLoadingVersions(false);
    }
  }, [file.id]);

  const loadComments = useCallback(async () => {
    setLoadingComments(true);
    try {
      const res = await fetch(`/api/media/files/${file.id}/comments`);
      const json = await res.json();
      if (res.ok) setComments(Array.isArray(json.data) ? json.data : []);
    } finally {
      setLoadingComments(false);
    }
  }, [file.id]);

  useEffect(() => { loadVersions(); loadComments(); }, [loadVersions, loadComments]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasPrev) onNavigate(allFiles[fileIndex - 1]);
      else if (e.key === "ArrowRight" && hasNext) onNavigate(allFiles[fileIndex + 1]);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileIndex, hasPrev, hasNext]);

  async function postComment() {
    if (!newComment.trim()) return;
    setPostingComment(true);
    try {
      const res = await fetch(`/api/media/files/${file.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment.trim(), type: "GENERAL" }),
      });
      if (res.ok) { setNewComment(""); await loadComments(); }
    } finally {
      setPostingComment(false);
    }
  }

  const latestVersion = versions[0] ?? file.versions[0];

  return (
    <div className="fixed inset-0 z-[60] flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-xl bg-white h-full flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 shrink-0">
          {/* Navigation prev/next */}
          {allFiles.length > 1 && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => hasPrev && onNavigate(allFiles[fileIndex - 1])}
                disabled={!hasPrev}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-xs text-gray-400 tabular-nums w-10 text-center">{fileIndex + 1}/{allFiles.length}</span>
              <button
                onClick={() => hasNext && onNavigate(allFiles[fileIndex + 1])}
                disabled={!hasNext}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium shrink-0">
                {FILE_TYPE_LABELS[file.type]}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${FILE_STATUS_COLORS[file.status]}`}>
                {FILE_STATUS_LABELS[file.status]}
              </span>
              <span className="text-xs text-gray-400 truncate">
                {file.filename}
                {latestVersion && <span className="ml-1 text-gray-300">v{latestVersion.versionNumber}</span>}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Preview — height capped on mobile so content below stays reachable */}
        <div className="shrink-0 bg-black h-44 md:h-56 relative overflow-hidden">
          {file.type === "VIDEO" ? (
            loadingVersions ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            ) : versions[0]?.streamUrl ? (
              <VideoPlayer src={versions[0].streamUrl} thumbnail={thumbnailUrl} onExpired={loadVersions} />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-gray-400 p-4">
                <svg className="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-gray-500 text-center">Vidéo non disponible<br/><span className="text-xs text-gray-400">Vérifiez la configuration S3</span></p>
              </div>
            )
          ) : thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnailUrl} alt={file.filename} className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-600">
              <p className="text-sm">Aucun aperçu disponible</p>
            </div>
          )}
        </div>

        {/* Actions review */}
        {canReview && file.status === "IN_REVIEW" && (
          <div className="shrink-0 flex gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
            <button onClick={() => { onReviewFile(file.id, "FINAL_APPROVED"); onClose(); }}
              className="flex-1 text-sm bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 font-medium">
              ✓ Valider
            </button>
            <button onClick={() => { onReviewFile(file.id, "REVISION_REQUESTED"); onClose(); }}
              className="flex-1 text-sm bg-amber-600 text-white py-2 rounded-lg hover:bg-amber-700 font-medium">
              ↩ Révision
            </button>
            <button onClick={() => { onReviewFile(file.id, "REJECTED"); onClose(); }}
              className="flex-1 text-sm bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 font-medium">
              ✗ Rejeter
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="shrink-0 flex border-b border-gray-200 px-5">
          {(["versions", "comments"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2.5 px-1 mr-5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-icc-violet text-icc-violet"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "versions" ? `Versions (${versions.length || "…"})` : `Commentaires (${comments.length || "…"})`}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === "versions" && (
            <div className="space-y-3">
              {canUpload && (
                <NewVersionUpload fileId={file.id} onDone={() => { loadVersions(); onRefresh(); }} />
              )}
              {loadingVersions ? (
                <p className="text-xs text-gray-400 text-center py-4">Chargement…</p>
              ) : versions.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">Aucune version enregistrée.</p>
              ) : (
                versions.map((v, idx) => (
                  <div key={v.id} className={`p-3 rounded-xl border ${idx === 0 ? "border-icc-violet/30 bg-icc-violet/5" : "border-gray-200 bg-gray-50"}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${idx === 0 ? "text-icc-violet" : "text-gray-500"}`}>
                        v{v.versionNumber} {idx === 0 && "(dernière)"}
                      </span>
                      <span className="text-xs text-gray-400">{formatDateTime(v.createdAt)}</span>
                    </div>
                    {v.notes && <p className="text-xs text-gray-600 mt-1">{v.notes}</p>}
                    {v.createdBy && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        par {v.createdBy.displayName ?? v.createdBy.name ?? "Inconnu"}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "comments" && (
            loadingComments ? (
              <p className="text-xs text-gray-400 text-center py-4">Chargement…</p>
            ) : comments.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Aucun commentaire.</p>
            ) : (
              <div className="space-y-2">
                {comments.map((c) => (
                  <div key={c.id} className="space-y-2">
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-gray-700">
                          {c.author?.displayName ?? c.author?.name ?? c.authorName ?? "Anonyme"}
                        </span>
                        {c.timecode !== null && (
                          <span className="text-xs bg-icc-violet/10 text-icc-violet px-1.5 py-0.5 rounded font-mono">
                            {formatTimecode(c.timecode)}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 ml-auto">{formatDateTime(c.createdAt)}</span>
                      </div>
                      <p className="text-sm text-gray-800">{c.content}</p>
                    </div>
                    {c.replies?.map((r) => (
                      <div key={r.id} className="ml-4 bg-white rounded-xl p-3 border border-gray-200">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-gray-700">
                            {r.author?.displayName ?? r.author?.name ?? r.authorName ?? "Anonyme"}
                          </span>
                          <span className="text-xs text-gray-400 ml-auto">{formatDateTime(r.createdAt)}</span>
                        </div>
                        <p className="text-sm text-gray-800">{r.content}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Comment input — pinned at bottom, always reachable */}
        {activeTab === "comments" && (
          <div className="shrink-0 flex gap-2 px-4 py-3 border-t border-gray-200 bg-white">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Ajouter un commentaire…"
              rows={2}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-icc-violet resize-none"
            />
            <button
              onClick={postComment}
              disabled={postingComment || !newComment.trim()}
              className="self-end text-sm bg-icc-violet text-white px-3 py-2 rounded-lg hover:bg-icc-violet/90 disabled:opacity-40 font-medium"
            >
              Envoyer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function MediaProjectDetail({
  project: initialProject,
  thumbnailUrls: initialThumbnailUrls,
  canUpload,
  canReview,
  canManage,
}: {
  project: MediaProject;
  thumbnailUrls: Record<string, string>;
  canUpload: boolean;
  canReview: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [thumbnailUrls] = useState(initialThumbnailUrls);
  const [statusFilter, setStatusFilter] = useState<MediaFileStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<MediaFileType | "">("");
  const [selectedFile, setSelectedFile] = useState<MediaFile | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activity, setActivity] = useState<{ label: string } | null>(null);

  async function refreshProject() {
    const res = await fetch(`/api/media-projects/${project.id}`);
    const json = await res.json();
    if (res.ok) setProject(json);
    router.refresh();
  }

  async function reviewFile(fileId: string, status: "FINAL_APPROVED" | "REVISION_REQUESTED" | "REJECTED") {
    const labels = { FINAL_APPROVED: "Validation finale…", REVISION_REQUESTED: "Demande de révision…", REJECTED: "Rejet en cours…" };
    setActivity({ label: labels[status] });
    await fetch(`/api/media/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await refreshProject();
    setActivity(null);
  }

  async function deleteProject() {
    setConfirmDelete(false);
    await fetch(`/api/media-projects/${project.id}`, { method: "DELETE" });
    router.push("/media/projects");
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const allFiles = project.files;
  const doneCount    = allFiles.filter((f) => DONE_STATUSES.includes(f.status)).length;
  const approvedCount = allFiles.filter((f) => f.status === "FINAL_APPROVED").length;
  const rejectedCount = allFiles.filter((f) => f.status === "REJECTED").length;
  const inReviewCount = allFiles.filter((f) => f.status === "IN_REVIEW").length;
  const revisionCount = allFiles.filter((f) => f.status === "REVISION_REQUESTED").length;
  const progressPct   = allFiles.length > 0 ? Math.round((doneCount / allFiles.length) * 100) : 0;

  // ── Onglets statut ─────────────────────────────────────────────────────────
  const statusTabs: { label: string; value: MediaFileStatus | ""; count: number }[] = [
    { label: "Tous", value: "", count: allFiles.length },
    ...(inReviewCount > 0  ? [{ label: "En révision", value: "IN_REVIEW" as MediaFileStatus, count: inReviewCount }] : []),
    ...(revisionCount > 0  ? [{ label: "Révision demandée", value: "REVISION_REQUESTED" as MediaFileStatus, count: revisionCount }] : []),
    ...(approvedCount > 0  ? [{ label: "Validé final", value: "FINAL_APPROVED" as MediaFileStatus, count: approvedCount }] : []),
    ...(rejectedCount > 0  ? [{ label: "Rejeté", value: "REJECTED" as MediaFileStatus, count: rejectedCount }] : []),
  ];

  const filteredFiles = allFiles.filter((f) => {
    if (statusFilter && f.status !== statusFilter) return false;
    if (typeFilter   && f.type   !== typeFilter)   return false;
    return true;
  });

  return (
    <>
      {selectedFile && (
        <FileDetailPanel
          file={selectedFile}
          thumbnailUrl={thumbnailUrls[selectedFile.id]}
          allFiles={filteredFiles}
          fileIndex={filteredFiles.findIndex((f) => f.id === selectedFile.id)}
          onNavigate={setSelectedFile}
          canUpload={canUpload}
          canReview={canReview}
          onClose={() => setSelectedFile(null)}
          onReviewFile={reviewFile}
          onRefresh={refreshProject}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title={`Supprimer "${project.name}" ?`}
          message="Tous les fichiers et versions seront définitivement supprimés."
          confirmLabel="Supprimer le projet"
          danger
          onConfirm={deleteProject}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      <div className="space-y-5">
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5">
            <Link href="/media/projects" className="text-xs text-gray-400 hover:text-icc-violet transition-colors inline-flex items-center gap-1 mb-3">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Projets
            </Link>

            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 truncate">{project.name}</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Créé le {formatDate(project.createdAt)}
                  {" · par "}
                  {project.createdBy.displayName ?? project.createdBy.name ?? "Inconnu"}
                </p>
                {project.description && (
                  <p className="text-sm text-gray-600 mt-2 leading-relaxed">{project.description}</p>
                )}
              </div>
              {canManage && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs text-red-400 hover:text-red-600 border border-red-100 hover:border-red-200 rounded-lg px-3 py-2 hover:bg-red-50 transition-colors shrink-0"
                >
                  Supprimer
                </button>
              )}
            </div>

            {/* Stat pills */}
            <div className="flex flex-wrap gap-2 mt-4">
              <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span className="text-xs font-semibold text-gray-700">{allFiles.length}</span>
                <span className="text-xs text-gray-500">fichier{allFiles.length !== 1 ? "s" : ""}</span>
              </div>
              {inReviewCount > 0 && (
                <div className="flex items-center gap-1.5 bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                  <span className="text-xs font-semibold text-purple-800">{inReviewCount}</span>
                  <span className="text-xs text-purple-700">en révision</span>
                </div>
              )}
              {revisionCount > 0 && (
                <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-xs font-semibold text-amber-800">{revisionCount}</span>
                  <span className="text-xs text-amber-700">révision demandée</span>
                </div>
              )}
              {approvedCount > 0 && (
                <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-xs font-semibold text-emerald-800">{approvedCount}</span>
                  <span className="text-xs text-emerald-700">validé{approvedCount > 1 ? "s" : ""} final</span>
                </div>
              )}
              {rejectedCount > 0 && (
                <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  <span className="text-xs font-semibold text-red-800">{rejectedCount}</span>
                  <span className="text-xs text-red-700">rejeté{rejectedCount > 1 ? "s" : ""}</span>
                </div>
              )}
            </div>
          </div>

          {/* Barre de progression */}
          {allFiles.length > 0 && (
            <div className="px-5 pb-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-gray-500">Progression de la validation</p>
                <p className="text-xs font-semibold text-gray-700">{progressPct}%</p>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${allFiles.length > 0 ? (approvedCount / allFiles.length) * 100 : 0}%` }}
                />
                <div
                  className="h-full bg-red-400 transition-all duration-500"
                  style={{ width: `${allFiles.length > 0 ? (rejectedCount / allFiles.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Liens de partage ────────────────────────────────── */}
        {canManage && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-icc-violet" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Liens de partage
              {project.shareTokens.length > 0 && (
                <span className="ml-auto text-xs text-gray-400 font-normal">
                  {project.shareTokens.length} lien{project.shareTokens.length > 1 ? "s" : ""}
                </span>
              )}
            </h2>
            <ShareTokenSection projectId={project.id} tokens={project.shareTokens} onRefresh={refreshProject} />
          </div>
        )}

        {/* ── Fichiers ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
          {/* Toolbar */}
          <div className="px-5 pt-4 pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {/* Onglets statut */}
              <div className="flex items-center gap-1 flex-wrap">
                {statusTabs.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setStatusFilter(tab.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      statusFilter === tab.value
                        ? "bg-icc-violet text-white"
                        : "text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {tab.label}
                    <span className={`text-xs px-1.5 py-0.5 rounded-md font-semibold ${
                      statusFilter === tab.value ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>
              {/* Droite : filtre type + import */}
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as MediaFileType | "")}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet bg-white"
                >
                  <option value="">Tous types</option>
                  {(Object.keys(FILE_TYPE_LABELS) as MediaFileType[]).map((t) => (
                    <option key={t} value={t}>{FILE_TYPE_LABELS[t]}</option>
                  ))}
                </select>
                {canUpload && (
                  <button
                    onClick={() => setShowUpload((v) => !v)}
                    className={`flex items-center gap-1.5 text-sm border rounded-lg px-3 py-1.5 transition-colors ${
                      showUpload
                        ? "border-icc-violet text-icc-violet bg-icc-violet/5"
                        : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Importer
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Bannière d'activité */}
          {activity && (
            <div className="px-5 py-2 border-b border-gray-100 bg-amber-50 flex items-center gap-3">
              <div className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="text-xs font-medium text-amber-800">{activity.label}</span>
            </div>
          )}

          {/* Zone d'upload (toggle) */}
          {showUpload && (
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
              <FileUploadZone
                projectId={project.id}
                onUploaded={() => { setShowUpload(false); refreshProject(); }}
                onActivityChange={(active, filename) =>
                  setActivity(active ? { label: `Upload en cours · ${filename ?? ""}` } : null)
                }
              />
            </div>
          )}

          {/* Grille fichiers */}
          <div className="p-4">
            {filteredFiles.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-gray-400">
                  {allFiles.length === 0 ? "Aucun fichier dans ce projet" : "Aucun résultat pour ces filtres"}
                </p>
                {(statusFilter || typeFilter) && (
                  <button
                    onClick={() => { setStatusFilter(""); setTypeFilter(""); }}
                    className="mt-2 text-xs text-icc-violet hover:underline"
                  >
                    Réinitialiser les filtres
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredFiles.map((file) => {
                  const thumb = thumbnailUrls[file.id];
                  const latestV = file.versions[0];
                  return (
                    <div
                      key={file.id}
                      className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden hover:border-icc-violet transition-all shadow-sm hover:shadow-md cursor-pointer group"
                      onClick={() => setSelectedFile(file)}
                    >
                      {/* Preview */}
                      <div className="aspect-video bg-gray-100 relative overflow-hidden">
                        {thumb ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={thumb} alt={file.filename} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                            {file.type === "VIDEO" && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="bg-black/50 rounded-full p-3 group-hover:bg-black/70 transition-colors">
                                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                  </svg>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-300">
                            {file.type === "VIDEO" ? (
                              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            ) : (
                              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            )}
                          </div>
                        )}
                        {/* Badge version */}
                        {latestV && (
                          <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded font-mono">
                            v{latestV.versionNumber}
                          </div>
                        )}
                        {/* Dot statut */}
                        <div className="absolute top-2 right-2">
                          <span className={`block w-2.5 h-2.5 rounded-full shadow-sm border border-white/50 ${FILE_STATUS_DOT[file.status]}`} />
                        </div>
                      </div>

                      {/* Info */}
                      <div className="p-3">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                          <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                            {FILE_TYPE_LABELS[file.type]}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${FILE_STATUS_COLORS[file.status]}`}>
                            {FILE_STATUS_LABELS[file.status]}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-900 truncate">{file.filename}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatSize(file.size)}
                          {file.duration ? ` · ${formatDuration(file.duration)}` : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
