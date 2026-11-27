"use client";

import { ChevronLeft, ChevronRight, Plus, Trash2, Upload, Video, X } from "lucide-react";
import { DashedAddButton, ShareLinksHeading, UploadToggleButton } from "@/components/media/MediaDetailParts";
import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { ConfirmModal as UiConfirmModal, FilterChip, IconButton, Input, Select, StatusChip, Textarea, buttonClasses, type StatusTone } from "@/components/ui";
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
  thumbnailUrl?: string | null;
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

const FILE_STATUS_TONE: Record<MediaFileStatus, StatusTone> = {
  PENDING:            "warning",
  APPROVED:           "success",
  REJECTED:           "danger",
  PREVALIDATED:       "info",
  PREREJECTED:        "warning",
  DRAFT:              "neutral",
  IN_REVIEW:          "brand",
  REVISION_REQUESTED: "warning",
  FINAL_APPROVED:     "success",
};

const FILE_STATUS_DOT: Record<MediaFileStatus, string> = {
  PENDING:            "bg-warning",
  APPROVED:           "bg-success",
  REJECTED:           "bg-danger",
  PREVALIDATED:       "bg-info",
  PREREJECTED:        "bg-warning",
  DRAFT:              "bg-control-line",
  IN_REVIEW:          "bg-brand",
  REVISION_REQUESTED: "bg-warning",
  FINAL_APPROVED:     "bg-success",
};

const FILE_TYPE_LABELS: Record<MediaFileType, string> = {
  PHOTO:  "Photo",
  VISUAL: "Visuel",
  VIDEO:  "Vidéo",
};

const TOKEN_TYPE_LABELS: Record<MediaTokenType, string> = {
  VALIDATOR:    "Validateur",
  PREVALIDATOR: "Pré-validateur",
  MEDIA:        "Téléchargement (validées)",
  MEDIA_ALL:    "Téléchargement (toutes)",
  GALLERY:      "Galerie",
  COLLECTION:   "Collection",
};

const TOKEN_TYPE_ICONS: Record<MediaTokenType, string> = {
  VALIDATOR:    "✅",
  PREVALIDATOR: "👁",
  MEDIA:        "⬇️",
  MEDIA_ALL:    "📦",
  GALLERY:      "🖼️",
  COLLECTION:   "📂",
};

const ALLOWED_TYPES: Record<string, MediaFileType> = {
  "video/mp4": "VIDEO", "video/quicktime": "VIDEO", "video/webm": "VIDEO",
  "image/jpeg": "VISUAL", "image/png": "VISUAL", "image/webp": "VISUAL",
  "image/svg+xml": "VISUAL", "application/pdf": "VISUAL",
};

// Statuts qui comptent comme "traités" pour la barre de progression
const DONE_STATUSES = new Set<MediaFileStatus>(["FINAL_APPROVED", "APPROVED", "REJECTED", "PREREJECTED"]);

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
  const secSuffix = sec > 0 ? ` ${sec}s` : "";
  return m > 0 ? `${m}min${secSuffix}` : `${sec}s`;
}

function formatTimecode(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// ─── Modale de confirmation ───────────────────────────────────────────────────

function ConfirmModal({ title, message, confirmLabel = "Confirmer", danger = false, onConfirm, onCancel }: {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly danger?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <UiConfirmModal
      open
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      variant={danger ? "danger" : "primary"}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

// ─── Liens de partage ─────────────────────────────────────────────────────────

function ShareTokenSection({ projectId, tokens, onRefresh }: {
  readonly projectId: string;
  readonly tokens: ShareToken[];
  readonly onRefresh: () => void;
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
  // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronisation avec une source externe (window, absent au rendu serveur)
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
          expiresInDays: newExpiry && Number.parseInt(newExpiry, 10) > 0 ? Number.parseInt(newExpiry, 10) : undefined,
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
    const paths: Record<MediaTokenType, string> = { VALIDATOR: "v", PREVALIDATOR: "v", MEDIA: "d", MEDIA_ALL: "d", GALLERY: "g", COLLECTION: "c" };
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
          <p className="text-sm text-ink-subtle text-center py-2">Aucun lien de partage</p>
        )}

        {tokens.map((token) => {
          const url = getTokenUrl(token);
          const isExpired = token.expiresAt && new Date(token.expiresAt) < new Date();
          return (
            <div key={token.id} className={`flex flex-wrap items-center gap-3 p-3 rounded-control border transition-colors ${isExpired ? "bg-danger-soft border-danger/30 opacity-70" : "bg-bg border-line"}`}>
              <span className="text-lg shrink-0" aria-hidden="true">{TOKEN_TYPE_ICONS[token.type]}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-ink-muted">{TOKEN_TYPE_LABELS[token.type]}</span>
                  {token.label && <span className="text-xs text-ink-muted">{token.label}</span>}
                  {isExpired && <span className="text-xs text-danger font-medium">Expiré</span>}
                </div>
                <p className="text-xs text-ink-subtle mt-0.5 truncate font-mono">{url}</p>
                <p className="text-xs text-ink-subtle mt-0.5">
                  {token.usageCount} usage{token.usageCount > 1 ? "s" : ""}
                  {token.expiresAt && ` · expire le ${formatDate(token.expiresAt)}`}
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Button type="button" variant="secondary" size="sm" className="min-h-11 sm:min-h-9" onClick={() => copy(url, token.id)}>
                  {copied === token.id ? "Copié !" : "Copier le lien"}
                </Button>
                <IconButton icon={Trash2} aria-label="Supprimer le lien" size="sm" className="max-sm:size-11" onClick={() => setPendingDeleteToken(token.id)} />
              </div>
            </div>
          );
        })}

        {open ? (
          <div className="p-4 border border-brand/30 rounded-card bg-brand-soft space-y-3">
            <p className="text-sm font-semibold text-ink">Nouveau lien de partage</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="Type"
                value={newType}
                onChange={(e) => setNewType(e.target.value as MediaTokenType)}
                options={(Object.keys(TOKEN_TYPE_LABELS) as MediaTokenType[]).map((t) => ({ value: t, label: TOKEN_TYPE_LABELS[t] }))}
              />
              <Input label="Durée en jours (0 = illimitée)" type="number" min="0" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} />
            </div>
            <Input label="Étiquette (facultative)" placeholder="Ex : Révision client" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
            {error && <p className="text-[13px] text-danger">{error}</p>}
            <div className="flex flex-wrap gap-2 justify-end">
              <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={() => { setOpen(false); setError(null); }}>
                Annuler
              </Button>
              <Button onClick={createToken} disabled={creating} size="sm" className="min-h-11 sm:min-h-9">
                {creating ? "Création en cours…" : "Créer le lien"}
              </Button>
            </div>
          </div>
        ) : (
          <DashedAddButton onClick={() => setOpen(true)}>Ajouter un lien</DashedAddButton>
        )}
      </div>

      {pendingDeleteToken && (
        <ConfirmModal
          title="Supprimer ce lien ?"
          message="Les personnes ayant ce lien ne pourront plus y accéder."
          confirmLabel="Supprimer le lien"
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
  readonly src: string;
  readonly thumbnail?: string;
  readonly onExpired: () => void;
}) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-ink-subtle p-4">
        {thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt="" className="absolute inset-0 w-full h-full object-contain opacity-20" />
        )}
        <p className="relative text-sm text-ink-subtle text-center z-10">Impossible de lire la vidéo</p>
        <button
          onClick={() => { setError(false); onExpired(); }}
          /* Bouton sur aperçu vidéo toujours sombre, indépendant du thème */
          // eslint-disable-next-line no-restricted-syntax -- visionneuse vidéo toujours sombre
          className="relative z-10 min-h-11 rounded-control bg-white/20 px-4 font-display text-sm font-semibold text-white transition-colors hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Recharger la vidéo
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
    xhr.onload  = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`S3 ${xhr.status}: ${xhr.responseText.slice(0, 200)}`));
    };
    xhr.onerror = () => reject(new Error("Erreur réseau (vérifiez CORS)"));
    xhr.onabort = () => reject(new Error("Upload annulé"));
    xhr.send(file);
  });
}

// ─── Zone d'upload nouveaux fichiers ─────────────────────────────────────────

function FileUploadZone({ projectId, onUploaded, onActivityChange }: {
  readonly projectId: string;
  readonly onUploaded: () => void;
  readonly onActivityChange?: (active: boolean, label?: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ file: string; pct: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: File[]) {
    const valid = files.filter((f) => ALLOWED_TYPES[f.type]);
    if (valid.length === 0) {
      setError("Format non supporté (MP4, MOV, WebM, JPEG, PNG, PDF)");
      return;
    }
    setUploading(true);
    setError(null);
    const errors: string[] = [];

    for (const file of valid) {
      try {
        setProgress({ file: file.name, pct: 0 });
        onActivityChange?.(true, file.name);

        // 1. Sign
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
        const { fileId, uploadUrl } = signJson;

        // 2. Upload S3
        await uploadToS3(uploadUrl, file, (pct) => setProgress({ file: file.name, pct }));

        // 3. Confirm
        const confirmRes = await fetch(`/api/media/files/${fileId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmUpload: true }),
        });
        const confirmJson = await confirmRes.json();
        if (!confirmRes.ok) throw new Error(confirmJson.error || "Erreur confirm");
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
    <>
    <button
      type="button"
      className="block w-full border-2 border-dashed border-control-line rounded-card p-6 text-center cursor-pointer hover:border-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus transition-all"
      onClick={() => inputRef.current?.click()}
      onDrop={(e) => { e.preventDefault(); void handleFiles(Array.from(e.dataTransfer.files)); }}
      onDragOver={(e) => e.preventDefault()}
    >
      {uploading && progress ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink-muted truncate">{progress.file}</p>
          <div className="w-full bg-surface-sunken rounded-full h-2">
            <div className="bg-brand h-2 rounded-full transition-all" style={{ width: `${progress.pct}%` }} />
          </div>
          <p className="text-xs text-ink-muted">{progress.pct}%</p>
        </div>
      ) : (
        <>
          <Upload className="w-8 h-8 text-ink-subtle mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm text-ink-muted">
            Glissez vos fichiers ici ou <span className="text-brand-text font-medium">cliquez pour choisir</span>
          </p>
          <p className="text-xs text-ink-subtle mt-1">Vidéo (MP4, MOV, WebM) · Visuel (JPEG, PNG, WebP, SVG, PDF)</p>
        </>
      )}
      {error && <p className="mt-2 text-[13px] text-danger whitespace-pre-line">{error}</p>}
    </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp,image/svg+xml,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => { void handleFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
      />
    </>
  );
}

// ─── Upload nouvelle version ──────────────────────────────────────────────────

function NewVersionUpload({ fileId, onDone }: { readonly fileId: string; readonly onDone: () => void }) {
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
        <Button type="button" variant="secondary" size="sm" className="min-h-11 sm:min-h-9" onClick={() => inputRef.current?.click()}>
          <Plus className="size-4" aria-hidden="true" strokeWidth={1.75} /> Ajouter une version
        </Button>
      ) : (
        <div className="mt-2 space-y-2 p-3 bg-brand-soft rounded-control border border-brand/20">
          <p className="text-sm font-semibold text-ink truncate">{pendingFile?.name}</p>
          <Input label="Note (facultative)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {uploading && (
            <div className="w-full bg-surface-sunken rounded-full h-1.5">
              <div className="bg-brand h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="min-h-11 sm:min-h-9" onClick={upload} disabled={uploading}>
              {uploading ? `Envoi en cours (${pct} %)…` : "Envoyer la version"}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={() => { setShowForm(false); setPendingFile(null); }}>
              Annuler
            </Button>
          </div>
          {error && <p className="text-[13px] text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Panneau détail fichier ───────────────────────────────────────────────────

const FILE_ICON_PATH = {
  video: "M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
  pdf: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  image: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
} as const;

function FileTypeIcon({ type, mimeType }: { readonly type: string; readonly mimeType: string }) {
  let d: string = FILE_ICON_PATH.image;
  if (type === "VIDEO") d = FILE_ICON_PATH.video;
  else if (mimeType === "application/pdf") d = FILE_ICON_PATH.pdf;
  return (
    <svg aria-hidden="true" className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d={d} />
    </svg>
  );
}

function FileDetailPanel({ file, allFiles, fileIndex, onNavigate, canUpload, canReview, canManage, onClose, onReviewFile, onDelete, onRefresh }: {
  readonly file: MediaFile;
  readonly allFiles: MediaFile[];
  readonly fileIndex: number;
  readonly onNavigate: (file: MediaFile) => void;
  readonly canUpload: boolean;
  readonly canReview: boolean;
  readonly canManage: boolean;
  readonly onClose: () => void;
  readonly onReviewFile: (id: string, status: "FINAL_APPROVED" | "REVISION_REQUESTED" | "REJECTED") => void;
  readonly onDelete: (id: string) => void;
  readonly onRefresh: () => void;
}) {
  const [versions, setVersions] = useState<(FileVersion & { createdBy?: { name: string | null; displayName: string | null } })[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [loadingComments, setLoadingComments] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [activeTab, setActiveTab] = useState<"versions" | "comments">("versions");
  const [pendingDelete, setPendingDelete] = useState(false);

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

  // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des données au montage et au changement de dépendance
  useEffect(() => { void loadVersions(); void loadComments(); }, [loadVersions, loadComments]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (!e.defaultPrevented) onClose(); }
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

  let preview: ReactNode;
  if (file.type === "VIDEO" && loadingVersions) {
    preview = (
      <div className="w-full h-full flex items-center justify-center">
        {/* eslint-disable-next-line no-restricted-syntax -- visionneuse vidéo/photo toujours sombre */}
        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  } else if (file.type === "VIDEO" && versions[0]?.streamUrl) {
    preview = <VideoPlayer src={versions[0].streamUrl} thumbnail={file.thumbnailUrl ?? undefined} onExpired={loadVersions} />;
  } else if (file.type === "VIDEO") {
    preview = (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-ink-subtle p-4">
        <Video className="w-10 h-10 text-ink-muted" aria-hidden="true" />
        <p className="text-sm text-ink-muted text-center">Vidéo non disponible<br/><span className="text-xs text-ink-subtle">Vérifiez la configuration S3</span></p>
      </div>
    );
  } else if (file.thumbnailUrl && file.mimeType.startsWith("image/")) {
    preview = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={file.thumbnailUrl} alt={file.filename} className="w-full h-full object-contain" />
    );
  } else {
    preview = (
      <div className="w-full h-full flex items-center justify-center text-ink-muted">
        <p className="text-sm">Aucun aperçu disponible</p>
      </div>
    );
  }

  return (
    <>
    {pendingDelete && (
      <ConfirmModal
        title={`Supprimer "${file.filename}" ?`}
        message="Le fichier et toutes ses versions seront définitivement supprimés."
        confirmLabel="Supprimer le fichier"
        danger
        onConfirm={() => { setPendingDelete(false); onDelete(file.id); }}
        onCancel={() => setPendingDelete(false)}
      />
    )}
    <div className="fixed inset-0 z-[60] flex">
      <div className="absolute inset-0 bg-scrim" aria-hidden="true" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-xl bg-surface h-full flex flex-col shadow-overlay overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line shrink-0">
          {/* Navigation prev/next */}
          {allFiles.length > 1 && (
            <div className="flex items-center gap-1 shrink-0">
              <IconButton icon={ChevronLeft} aria-label="Fichier précédent" size="sm" className="max-sm:size-11" onClick={() => hasPrev && onNavigate(allFiles[fileIndex - 1])} disabled={!hasPrev} />
              <span className="text-xs text-ink-subtle tabular-nums w-10 text-center">{fileIndex + 1}/{allFiles.length}</span>
              <IconButton icon={ChevronRight} aria-label="Fichier suivant" size="sm" className="max-sm:size-11" onClick={() => hasNext && onNavigate(allFiles[fileIndex + 1])} disabled={!hasNext} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <StatusChip tone="neutral" className="shrink-0">{FILE_TYPE_LABELS[file.type]}</StatusChip>
              <StatusChip tone={FILE_STATUS_TONE[file.status]} className="shrink-0">
                {FILE_STATUS_LABELS[file.status]}
              </StatusChip>
              <span className="text-xs text-ink-subtle truncate">
                {file.filename}
                {latestVersion && <span className="ml-1 text-ink-subtle">v{latestVersion.versionNumber}</span>}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canManage && (
              <IconButton icon={Trash2} aria-label="Supprimer ce fichier" className="max-sm:size-11" onClick={() => setPendingDelete(true)} />
            )}
            <IconButton icon={X} aria-label="Fermer le fichier" className="max-sm:size-11" onClick={onClose} />
          </div>
        </div>

        {/* Preview — height capped on mobile so content below stays reachable */}
        {/* Aperçu média toujours sombre (cadre vidéo/photo), indépendant du thème */}
        {/* eslint-disable-next-line no-restricted-syntax -- visionneuse vidéo/photo toujours sombre */}
        <div className="shrink-0 bg-black h-44 md:h-56 relative overflow-hidden">
          {preview}
        </div>

        {/* Actions review */}
        {canReview && file.status === "IN_REVIEW" && (
          <div className="shrink-0 flex flex-wrap gap-2 px-4 py-2.5 border-b border-line bg-bg">
            <Button type="button" className="flex-1" onClick={() => { onReviewFile(file.id, "FINAL_APPROVED"); onClose(); }}>
              Valider le visuel
            </Button>
            <Button type="button" variant="secondary" className="flex-1" onClick={() => { onReviewFile(file.id, "REVISION_REQUESTED"); onClose(); }}>
              Demander une révision
            </Button>
            <Button type="button" variant="secondary" className="flex-1" onClick={() => { onReviewFile(file.id, "REJECTED"); onClose(); }}>
              Rejeter le visuel
            </Button>
          </div>
        )}

        {/* Tabs */}
        <div className="shrink-0 flex border-b border-line px-5">
          {(["versions", "comments"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              aria-pressed={activeTab === tab}
              className={`min-h-11 py-2.5 px-1 mr-5 text-sm font-semibold border-b-2 transition-colors focus-visible:outline-2 focus-visible:outline-focus ${
                activeTab === tab
                  ? "border-brand text-brand-text"
                  : "border-transparent text-ink-muted hover:text-ink"
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
                <NewVersionUpload fileId={file.id} onDone={() => { void loadVersions(); onRefresh(); }} />
              )}
              {loadingVersions && <p className="text-[13px] text-ink-subtle text-center py-4">Chargement en cours…</p>}
              {!loadingVersions && versions.length === 0 && (
                <p className="text-xs text-ink-subtle text-center py-4">Aucune version enregistrée.</p>
              )}
              {!loadingVersions && versions.length > 0 && (
                versions.map((v, idx) => (
                  <div key={v.id} className={`p-3 rounded-control border ${idx === 0 ? "border-brand/30 bg-brand-soft" : "border-line bg-bg"}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${idx === 0 ? "text-brand-text" : "text-ink-muted"}`}>
                        v{v.versionNumber} {idx === 0 && "(dernière)"}
                      </span>
                      <span className="text-xs text-ink-subtle">{formatDateTime(v.createdAt)}</span>
                    </div>
                    {v.notes && <p className="text-xs text-ink-muted mt-1">{v.notes}</p>}
                    {v.createdBy && (
                      <p className="text-xs text-ink-subtle mt-0.5">
                        par {v.createdBy.displayName ?? v.createdBy.name ?? "Inconnu"}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "comments" && loadingComments && (
            <p className="text-[13px] text-ink-subtle text-center py-4">Chargement en cours…</p>
          )}
          {activeTab === "comments" && !loadingComments && comments.length === 0 && (
            <p className="text-xs text-ink-subtle text-center py-4">Aucun commentaire.</p>
          )}
          {activeTab === "comments" && !loadingComments && comments.length > 0 && (
              <div className="space-y-2">
                {comments.map((c) => (
                  <div key={c.id} className="space-y-2">
                    <div className="bg-bg rounded-control p-3 border border-line">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-ink-muted">
                          {c.author?.displayName ?? c.author?.name ?? c.authorName ?? "Anonyme"}
                        </span>
                        {c.timecode !== null && (
                          <span className="text-xs bg-brand-soft text-brand-text px-1.5 py-0.5 rounded-chip font-mono">
                            {formatTimecode(c.timecode)}
                          </span>
                        )}
                        <span className="text-xs text-ink-subtle ml-auto">{formatDateTime(c.createdAt)}</span>
                      </div>
                      <p className="text-sm text-ink">{c.content}</p>
                    </div>
                    {c.replies?.map((r) => (
                      <div key={r.id} className="ml-4 bg-surface rounded-control p-3 border border-line">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-ink-muted">
                            {r.author?.displayName ?? r.author?.name ?? r.authorName ?? "Anonyme"}
                          </span>
                          <span className="text-xs text-ink-subtle ml-auto">{formatDateTime(r.createdAt)}</span>
                        </div>
                        <p className="text-sm text-ink">{r.content}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
          )}
        </div>

        {/* Comment input — pinned at bottom, always reachable */}
        {activeTab === "comments" && (
          <div className="shrink-0 flex items-end gap-2 px-4 py-3 border-t border-line bg-surface">
            <div className="min-w-0 flex-1">
              <Textarea
                label=""
                aria-label="Commentaire"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Ajouter un commentaire…"
                rows={2}
              />
            </div>
            <Button type="button" onClick={postComment} disabled={postingComment || !newComment.trim()}>
              {postingComment ? "Envoi en cours…" : "Envoyer le commentaire"}
            </Button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

/** Liste vide : projet sans fichier, ou filtres sans résultat (avec réinitialisation). */
function NoFiles({
  projectEmpty,
  filtered,
  onReset,
}: {
  readonly projectEmpty: boolean;
  readonly filtered: boolean;
  readonly onReset: () => void;
}) {
  return (
    <div className="text-center py-16 text-ink-subtle">
      <Video className="w-12 h-12 text-ink-subtle mx-auto mb-3" aria-hidden="true" />
      <p className="text-sm text-ink-subtle">
        {projectEmpty ? "Aucun fichier dans ce projet" : "Aucun résultat pour ces filtres"}
      </p>
      {filtered && (
        <Button type="button" variant="ghost" size="sm" className="mt-2 min-h-11 sm:min-h-9" onClick={onReset}>
          Réinitialiser les filtres
        </Button>
      )}
    </div>
  );
}

/** Barre de progression : fichiers acceptés (validés ou approuvés), puis refusés. */
function ValidationProgress({
  total,
  accepted,
  refused,
  progressPct,
}: {
  readonly total: number;
  readonly accepted: number;
  readonly refused: number;
  readonly progressPct: number;
}) {
  return (
    <div className="px-5 pb-4">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs text-ink-muted">Progression de la validation</p>
        <p className="text-xs font-semibold text-ink-muted">{progressPct}%</p>
      </div>
      <div className="h-2 bg-surface-sunken rounded-full overflow-hidden flex">
        <div
          className="h-full bg-success transition-all duration-500"
          style={{ width: `${total > 0 ? (accepted / total) * 100 : 0}%` }}
        />
        <div
          className="h-full bg-danger transition-all duration-500"
          style={{ width: `${total > 0 ? (refused / total) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

const plural = (n: number) => (n > 1 ? "s" : "");

/** Pastilles de décompte par statut de fichier (seuls les statuts présents sont affichés). */
function StatusCountPills({
  counts,
}: {
  readonly counts: {
    inReview: number;
    revision: number;
    prevalidated: number;
    prerejected: number;
    approved: number;
    finalApproved: number;
    rejected: number;
  };
}) {
  const pills: { key: string; count: number; tone: StatusTone; label: string }[] = [
    { key: "inReview", count: counts.inReview, tone: "brand", label: "en révision" },
    { key: "revision", count: counts.revision, tone: "warning", label: `révision${plural(counts.revision)} demandée${plural(counts.revision)}` },
    { key: "prevalidated", count: counts.prevalidated, tone: "info", label: `pré-validé${plural(counts.prevalidated)}` },
    { key: "prerejected", count: counts.prerejected, tone: "warning", label: `pré-rejeté${plural(counts.prerejected)}` },
    { key: "approved", count: counts.approved, tone: "success", label: `approuvé${plural(counts.approved)}` },
    { key: "finalApproved", count: counts.finalApproved, tone: "success", label: `validé${plural(counts.finalApproved)} final${plural(counts.finalApproved)}` },
    { key: "rejected", count: counts.rejected, tone: "danger", label: `rejeté${plural(counts.rejected)}` },
  ];
  return (
    <>
      {pills
        .filter((p) => p.count > 0)
        .map((p) => (
          <StatusChip key={p.key} tone={p.tone}>{p.count} {p.label}</StatusChip>
        ))}
    </>
  );
}

export default function MediaProjectDetail({
  project: initialProject,
  thumbnailUrls: initialThumbnailUrls,
  canUpload,
  canReview,
  canManage,
}: {
  readonly project: MediaProject;
  readonly thumbnailUrls: Record<string, string>;
  readonly canUpload: boolean;
  readonly canReview: boolean;
  readonly canManage: boolean;
}) {
  const router = useRouter();
  // Merge server-side thumbnail URLs into the initial files so we have them from the start
  const hydrated = { ...initialProject, files: initialProject.files.map((f) => ({ ...f, thumbnailUrl: f.thumbnailUrl ?? initialThumbnailUrls[f.id] ?? null })) };
  const [project, setProject] = useState(hydrated);
  const [statusFilter, setStatusFilter] = useState<MediaFileStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<MediaFileType | "">("");
  const [selectedFile, setSelectedFile] = useState<MediaFile | null>(null);
  const [showUpload, setShowUpload] = useState(canUpload && initialProject.files.length === 0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activity, setActivity] = useState<{ label: string } | null>(null);

  async function refreshProject() {
    const res = await fetch(`/api/media-projects/${project.id}`);
    const json = await res.json();
    if (res.ok) {
      const updated = json.data ?? json;
      setProject(updated);
      setSelectedFile((prev) => prev ? (updated.files?.find((f: MediaFile) => f.id === prev.id) ?? prev) : null);
    }
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

  async function deleteFile(fileId: string) {
    setSelectedFile(null);
    setActivity({ label: "Suppression du fichier…" });
    await fetch(`/api/media/files/${fileId}`, { method: "DELETE" });
    await refreshProject();
    setActivity(null);
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const allFiles = project.files ?? [];
  const doneCount        = allFiles.filter((f) => DONE_STATUSES.has(f.status)).length;
  const finalApprovedCount = allFiles.filter((f) => f.status === "FINAL_APPROVED").length;
  const approvedCount    = allFiles.filter((f) => f.status === "APPROVED").length;
  const prevalidatedCount = allFiles.filter((f) => f.status === "PREVALIDATED").length;
  const rejectedCount    = allFiles.filter((f) => f.status === "REJECTED").length;
  const prerejectedCount = allFiles.filter((f) => f.status === "PREREJECTED").length;
  const inReviewCount    = allFiles.filter((f) => f.status === "IN_REVIEW").length;
  const revisionCount    = allFiles.filter((f) => f.status === "REVISION_REQUESTED").length;
  const progressPct      = allFiles.length > 0 ? Math.round((doneCount / allFiles.length) * 100) : 0;

  // ── Onglets statut ─────────────────────────────────────────────────────────
  const statusTabs: { label: string; value: MediaFileStatus | ""; count: number }[] = [
    { label: "Tous", value: "", count: allFiles.length },
    ...(inReviewCount > 0      ? [{ label: "En révision",       value: "IN_REVIEW"           as MediaFileStatus, count: inReviewCount }]      : []),
    ...(revisionCount > 0      ? [{ label: "Révision demandée", value: "REVISION_REQUESTED"  as MediaFileStatus, count: revisionCount }]      : []),
    ...(prevalidatedCount > 0  ? [{ label: "Pré-validé",        value: "PREVALIDATED"         as MediaFileStatus, count: prevalidatedCount }]  : []),
    ...(prerejectedCount > 0   ? [{ label: "Pré-rejeté",        value: "PREREJECTED"          as MediaFileStatus, count: prerejectedCount }]   : []),
    ...(approvedCount > 0      ? [{ label: "Approuvé",          value: "APPROVED"             as MediaFileStatus, count: approvedCount }]      : []),
    ...(finalApprovedCount > 0 ? [{ label: "Validé final",      value: "FINAL_APPROVED"       as MediaFileStatus, count: finalApprovedCount }] : []),
    ...(rejectedCount > 0      ? [{ label: "Rejeté",            value: "REJECTED"             as MediaFileStatus, count: rejectedCount }]      : []),
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
          allFiles={filteredFiles}
          fileIndex={filteredFiles.findIndex((f) => f.id === selectedFile.id)}
          onNavigate={setSelectedFile}
          canUpload={canUpload}
          canReview={canReview}
          canManage={canManage}
          onClose={() => setSelectedFile(null)}
          onReviewFile={reviewFile}
          onDelete={deleteFile}
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
        <div className="bg-surface rounded-card border border-line shadow-card overflow-hidden">
          <div className="p-5">
            <Link href="/media/projects" className={`${buttonClasses("ghost", "sm")} min-h-11 sm:min-h-9 -ml-2 mb-3`}>
              <ChevronLeft className="size-4" aria-hidden="true" strokeWidth={1.75} />
              Retour aux projets
            </Link>

            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-ink truncate">{project.name}</h1>
                <p className="text-sm text-ink-muted mt-1">
                  Créé le {formatDate(project.createdAt)}
                  {" · par "}
                  {project.createdBy.displayName ?? project.createdBy.name ?? "Inconnu"}
                </p>
                {project.description && (
                  <p className="text-sm text-ink-muted mt-2 leading-relaxed">{project.description}</p>
                )}
              </div>
              {canManage && (
                <Button type="button" variant="ghost" size="sm" className="min-h-11 shrink-0 sm:min-h-9" onClick={() => setConfirmDelete(true)}>
                  Supprimer le projet
                </Button>
              )}
            </div>

            {/* Stat pills */}
            <div className="flex flex-wrap gap-2 mt-4">
              <StatusChip tone="neutral" icon={Video}>{allFiles.length} fichier{allFiles.length > 1 ? "s" : ""}</StatusChip>
              <StatusCountPills
                counts={{
                  inReview: inReviewCount,
                  revision: revisionCount,
                  prevalidated: prevalidatedCount,
                  prerejected: prerejectedCount,
                  approved: approvedCount,
                  finalApproved: finalApprovedCount,
                  rejected: rejectedCount,
                }}
              />
            </div>
          </div>

          {/* Barre de progression */}
          {allFiles.length > 0 && (
            <ValidationProgress
              total={allFiles.length}
              accepted={finalApprovedCount + approvedCount}
              refused={rejectedCount + prerejectedCount}
              progressPct={progressPct}
            />
          )}
        </div>

        {/* ── Liens de partage ────────────────────────────────── */}
        {canManage && (
          <div className="bg-surface rounded-card border border-line shadow-card p-5">
            <ShareLinksHeading count={project.shareTokens.length} />
            <ShareTokenSection projectId={project.id} tokens={project.shareTokens} onRefresh={refreshProject} />
          </div>
        )}

        {/* ── Fichiers ────────────────────────────────────────── */}
        <div className="bg-surface rounded-card border border-line shadow-card">
          {/* Toolbar */}
          <div className="px-5 pt-4 pb-3 border-b border-line">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {/* Onglets statut */}
              <div className="flex items-center gap-2 flex-wrap">
                {statusTabs.map((tab) => (
                  <FilterChip key={tab.value} pressed={statusFilter === tab.value} onClick={() => setStatusFilter(tab.value)}>
                    {tab.label}
                    <span className="text-xs font-semibold tabular-nums">{tab.count}</span>
                  </FilterChip>
                ))}
              </div>
              {/* Droite : filtre type + import */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-40">
                  <Select
                    label=""
                    aria-label="Type de fichier"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as MediaFileType | "")}
                    options={[{ value: "", label: "Tous les types" }, ...(Object.keys(FILE_TYPE_LABELS) as MediaFileType[]).map((t) => ({ value: t, label: FILE_TYPE_LABELS[t] }))]}
                  />
                </div>
                {canUpload && (
                  <UploadToggleButton active={showUpload} onClick={() => setShowUpload((v) => !v)} />
                )}
              </div>
            </div>
          </div>

          {/* Bannière d'activité */}
          {activity && (
            <div className="px-5 py-2 border-b border-line bg-warning-soft flex items-center gap-3">
              <div className="w-3.5 h-3.5 border-2 border-warning border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="text-xs font-medium text-warning">{activity.label}</span>
            </div>
          )}

          {/* Zone d'upload (toggle) */}
          {showUpload && (
            <div className="px-5 py-4 border-b border-line bg-bg">
              <FileUploadZone
                projectId={project.id}
                onUploaded={() => { setShowUpload(false); refreshProject().catch(() => undefined); }}
                onActivityChange={(active, filename) =>
                  setActivity(active ? { label: `Envoi en cours · ${filename ?? ""}` } : null)
                }
              />
            </div>
          )}

          {/* Grille fichiers */}
          <div className="p-4">
            {filteredFiles.length === 0 ? (
              <NoFiles
                projectEmpty={allFiles.length === 0}
                filtered={Boolean(statusFilter || typeFilter)}
                onReset={() => { setStatusFilter(""); setTypeFilter(""); }}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredFiles.map((file) => {
                  const thumb = file.thumbnailUrl;
                  const isImage = file.mimeType.startsWith("image/");
                  const latestV = file.versions[0];
                  return (
                    <button
                      type="button"
                      key={file.id}
                      className="block w-full text-left bg-surface border border-line rounded-card overflow-hidden hover:border-brand transition-all shadow-card hover:shadow-float cursor-pointer group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      onClick={() => setSelectedFile(file)}
                    >
                      {/* Preview */}
                      <div className="aspect-video bg-surface-sunken relative overflow-hidden">
                        {thumb && isImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt={file.filename} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-ink-subtle">
                            <FileTypeIcon type={file.type} mimeType={file.mimeType} />
                          </div>
                        )}
                        {/* Badge version */}
                        {/* Scrim toujours sombre : texte blanc fixe, indépendant du thème */}
                        {latestV && (
                          // eslint-disable-next-line no-restricted-syntax -- scrim toujours sombre sur vignette média
                          <div className="absolute top-2 left-2 bg-scrim text-white text-xs px-1.5 py-0.5 rounded-chip font-mono">
                            v{latestV.versionNumber}
                          </div>
                        )}
                        {/* Dot statut */}
                        <div className="absolute top-2 right-2">
                          {/* Halo blanc fixe pour rester visible sur une vignette de couleur quelconque */}
                          {/* eslint-disable-next-line no-restricted-syntax -- halo fixe sur vignette média de couleur quelconque */}
                          <span className={`block w-2.5 h-2.5 rounded-full shadow-card border border-white/50 ${FILE_STATUS_DOT[file.status]}`} />
                        </div>
                      </div>

                      {/* Info */}
                      <div className="p-3">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                          <StatusChip tone="neutral">{FILE_TYPE_LABELS[file.type]}</StatusChip>
                          <StatusChip tone={FILE_STATUS_TONE[file.status]}>
                            {FILE_STATUS_LABELS[file.status]}
                          </StatusChip>
                        </div>
                        <p className="text-sm font-medium text-ink truncate">{file.filename}</p>
                        <p className="text-xs text-ink-subtle mt-0.5">
                          {formatSize(file.size)}
                          {file.duration ? ` · ${formatDuration(file.duration)}` : ""}
                        </p>
                      </div>
                    </button>
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
