"use client";

import { Check, ChevronLeft, ImageIcon, Trash2, Upload } from "lucide-react";
import { DashedAddButton, ShareLinksHeading, UploadToggleButton } from "@/components/media/MediaDetailParts";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { Checkbox, ConfirmModal, FilterChip, IconButton, Input, Select, StatusChip, buttonClasses, type StatusTone } from "@/components/ui";
import type { MediaEventStatus, MediaPhotoStatus, MediaTokenType } from "@/generated/prisma/enums";
import MediaLightbox from "@/components/media/MediaLightbox";
import { paths } from "@/lib/paths";

// ─── Types ────────────────────────────────────────────────────────────────────

type Photo = {
  id: string;
  filename: string;
  originalKey: string;
  thumbnailKey: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  status: MediaPhotoStatus;
  validatedAt: Date | null;
  validatedBy: string | null;
  mediaEventId: string;
  uploadedAt: Date;
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

type MediaEvent = {
  id: string;
  name: string;
  date: Date;
  description: string | null;
  status: MediaEventStatus;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string | null; displayName: string | null };
  planningEvent: { id: string; title: string; type: string; date: Date } | null;
  photos: Photo[];
  shareTokens: ShareToken[];
  _count: { photos: number; files: number };
};

// ─── Constantes ───────────────────────────────────────────────────────────────

const PHOTO_STATUS_LABELS: Record<MediaPhotoStatus, string> = {
  PENDING:      "En attente",
  APPROVED:     "Approuvée",
  REJECTED:     "Rejetée",
  PREVALIDATED: "Pré-validée",
  PREREJECTED:  "Pré-rejetée",
};

const PHOTO_STATUS_TONE: Record<MediaPhotoStatus, StatusTone> = {
  PENDING:      "warning",
  APPROVED:     "success",
  REJECTED:     "danger",
  PREVALIDATED: "info",
  PREREJECTED:  "warning",
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

const EVENT_STATUS_LABELS: Record<MediaEventStatus, string> = {
  DRAFT:         "Brouillon",
  PENDING_REVIEW:"En révision",
  REVIEWED:      "Validé",
  ARCHIVED:      "Archivé",
};

const EVENT_STATUS_TONE: Record<MediaEventStatus, StatusTone> = {
  DRAFT:         "neutral",
  PENDING_REVIEW:"warning",
  REVIEWED:      "success",
  ARCHIVED:      "neutral",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PHOTO_STATUS_DOT_CLASS: Record<string, string> = {
  APPROVED: "bg-success",
  REJECTED: "bg-danger",
  PREVALIDATED: "bg-info",
};

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// ─── Upload zone ──────────────────────────────────────────────────────────────

function PhotoUploadZone({ eventId, onUploaded, onProgressChange }: {
  readonly eventId: string;
  readonly onUploaded: () => void;
  readonly onProgressChange?: (p: { done: number; total: number } | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reportProgress(p: { done: number; total: number } | null) {
    setProgress(p);
    onProgressChange?.(p);
  }

  async function uploadFiles(files: File[]) {
    setUploading(true);
    setError(null);
    reportProgress({ done: 0, total: files.length });
    let done = 0;
    const errors: string[] = [];

    for (const file of files) {
      try {
        // 1 — Demande une presigned PUT URL
        const signRes = await fetch(`/api/media-events/${eventId}/photos/sign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, mimeType: file.type, size: file.size }),
        });
        const signJson = await signRes.json();
        if (!signRes.ok) throw new Error(signJson.error || "Erreur de signature");

        // 2 — Upload direct navigateur → S3 (aucun transit par Next.js)
        const putRes = await fetch(signJson.url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!putRes.ok) throw new Error("Échec de l'upload S3 — vérifiez la configuration CORS du bucket");

        // 3 — Confirmation : sharp (EXIF + JPEG 90% + thumbnail WebP) + création DB
        const confirmRes = await fetch(`/api/media-events/${eventId}/photos/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quarantineId: signJson.quarantineId, filename: file.name, mimeType: file.type, size: file.size }),
        });
        const confirmJson = await confirmRes.json();
        if (!confirmRes.ok) throw new Error(confirmJson.error || "Erreur de confirmation");
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : "Erreur réseau"}`);
      }
      done++;
      reportProgress({ done, total: files.length });
    }

    setUploading(false);
    reportProgress(null);
    if (errors.length > 0) setError(errors.join("\n"));
    onUploaded();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      ["image/jpeg", "image/png", "image/webp"].includes(f.type)
    );
    if (files.length > 0) void uploadFiles(files);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) void uploadFiles(files);
    e.target.value = "";
  }

  return (
    <>
    <button
      type="button"
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => !uploading && inputRef.current?.click()}
      className="block w-full border-2 border-dashed border-control-line rounded-card p-6 text-center cursor-pointer hover:border-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus transition-all"
    >
      {uploading && progress ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink-muted">
            Envoi en cours : {progress.done}/{progress.total}
          </p>
          <div className="w-full bg-surface-sunken rounded-full h-2">
            <div
              className="bg-brand h-2 rounded-full transition-all"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          <Upload className="w-8 h-8 text-ink-subtle mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm text-ink-muted">
            Glissez des photos ici ou <span className="text-brand-text font-medium">cliquez pour choisir</span>
          </p>
          <p className="text-xs text-ink-subtle mt-1">JPEG, PNG, WebP</p>
        </>
      )}
      {error && <p className="mt-2 text-[13px] text-danger whitespace-pre-line">{error}</p>}
    </button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={onFileChange} />
    </>
  );
}

// ─── Liens de partage ─────────────────────────────────────────────────────────

function ShareTokenSection({ eventId, tokens, onRefresh }: {
  readonly eventId: string;
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
  const [pendingDeleteTokenId, setPendingDeleteTokenId] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronisation avec une source externe (window, absent au rendu serveur)
  useEffect(() => { setOrigin(window.location.origin); }, []);

  async function createToken() {
    setError(null);
    setCreating(true);
    try {
      const res = await fetch(`/api/media-events/${eventId}/share`, {
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
    await fetch(`/api/media-events/${eventId}/share?tokenId=${tokenId}`, { method: "DELETE" });
    setPendingDeleteTokenId(null);
    onRefresh();
  }

  function getTokenUrl(token: ShareToken) {
    const tokenPaths: Record<MediaTokenType, string> = { VALIDATOR: "v", PREVALIDATOR: "v", MEDIA: "d", MEDIA_ALL: "d", GALLERY: "g", COLLECTION: "c" };
    return `${origin}/media/${tokenPaths[token.type]}/${token.token}`;
  }

  async function copy(url: string, id: string) {
    await navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
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
              <Button type="button" variant="secondary" size="sm" onClick={() => copy(url, token.id)}>
                {copied === token.id ? "Copié !" : "Copier le lien"}
              </Button>
              <IconButton icon={Trash2} aria-label="Supprimer le lien" size="sm" onClick={() => setPendingDeleteTokenId(token.id)} />
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
          <Input label="Étiquette (facultative)" placeholder="Ex : Validateurs familles" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <div className="flex flex-wrap gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setOpen(false); setError(null); }}>
              Annuler
            </Button>
            <Button onClick={createToken} disabled={creating} size="sm">
              {creating ? "Création en cours…" : "Créer le lien"}
            </Button>
          </div>
        </div>
      ) : (
        <DashedAddButton onClick={() => setOpen(true)}>Ajouter un lien</DashedAddButton>
      )}

      {pendingDeleteTokenId !== null && (
        <ConfirmDeleteModal
          title="Supprimer ce lien de partage ?"
          message="Les utilisateurs ayant ce lien ne pourront plus l'utiliser."
          onConfirm={() => deleteToken(pendingDeleteTokenId)}
          onCancel={() => setPendingDeleteTokenId(null)}
        />
      )}
    </div>
  );
}

// ─── Confirmation de suppression ─────────────────────────────────────────────

function ConfirmDeleteModal({ title, message, onConfirm, onCancel }: {
  readonly title: string;
  readonly message: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <ConfirmModal open title={title} message={message} confirmLabel="Supprimer définitivement" onConfirm={onConfirm} onCancel={onCancel} />
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function PhotoLightbox({ photos, initialIndex, thumbnailUrls, canUpload, onClose, onRequestDelete }: {
  readonly photos: Photo[];
  readonly initialIndex: number;
  readonly thumbnailUrls: Record<string, string>;
  readonly canUpload: boolean;
  readonly onClose: () => void;
  readonly onRequestDelete: (photoId: string) => void;
}) {
  // Plus aucune photo (dernière supprimée) : fermeture.
  useEffect(() => {
    if (photos.length === 0) onClose();
  }, [photos.length, onClose]);

  const items = photos.map((p) => ({ ...p, src: thumbnailUrls[p.id] ?? null, alt: p.filename }));

  return (
    <MediaLightbox
      items={items}
      initialIndex={initialIndex}
      onClose={onClose}
      header={(photo) => (
        <>
          <StatusChip tone={PHOTO_STATUS_TONE[photo.status]} className="shrink-0">
            {PHOTO_STATUS_LABELS[photo.status]}
          </StatusChip>
          {/* eslint-disable-next-line no-restricted-syntax -- visionneuse photo plein écran toujours sombre */}
          <p className="text-sm text-white/70 truncate">{photo.filename}</p>
          {/* eslint-disable-next-line no-restricted-syntax -- visionneuse photo plein écran toujours sombre */}
          <span className="text-xs text-white/40 shrink-0">{formatSize(photo.size)}</span>
        </>
      )}
      footer={(photo) => (
        <>
          <StatusChip tone={PHOTO_STATUS_TONE[photo.status]}>
            {PHOTO_STATUS_LABELS[photo.status]}
          </StatusChip>
          {canUpload && (
            <Button type="button" variant="secondary" onClick={() => onRequestDelete(photo.id)}>
              <Trash2 className="size-4" aria-hidden="true" strokeWidth={1.75} /> Supprimer la photo
            </Button>
          )}
        </>
      )}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type PlanningEventOption = { id: string; title: string; type: string; date: string };

/** Bandeau d'activité : progression de l'upload, ou suppression en cours. */
function ActivityBanner({ uploadProgress }: { readonly uploadProgress: { done: number; total: number } | null }) {
  return (
    <div className="px-5 py-2 border-b border-line bg-warning-soft flex items-center gap-3">
      <div className="w-3.5 h-3.5 border-2 border-warning border-t-transparent rounded-full animate-spin shrink-0" />
      {uploadProgress ? (
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-warning">
              Envoi en cours · {uploadProgress.done}/{uploadProgress.total} photo{uploadProgress.total > 1 ? "s" : ""}
            </span>
            <span className="text-xs text-warning">{Math.round((uploadProgress.done / uploadProgress.total) * 100)}%</span>
          </div>
          <div className="h-1 bg-warning-soft rounded-full overflow-hidden">
            <div
              className="h-full bg-warning transition-all duration-300"
              style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%` }}
            />
          </div>
        </div>
      ) : (
        <span className="text-xs font-medium text-warning">Suppression en cours…</span>
      )}
    </div>
  );
}

/** Pastilles de décompte : total, en attente, approuvées, rejetées. */
function PhotoStatPills({
  total,
  pending,
  approved,
  rejected,
}: {
  readonly total: number;
  readonly pending: number;
  readonly approved: number;
  readonly rejected: number;
}) {
  return (
    <div className="flex flex-wrap gap-2 mt-4">
      <StatusChip tone="neutral" icon={ImageIcon}>{total} photo{total > 1 ? "s" : ""}</StatusChip>
      {pending > 0 && <StatusChip tone="warning">{pending} en attente</StatusChip>}
      {approved > 0 && <StatusChip tone="success">{approved} approuvée{approved > 1 ? "s" : ""}</StatusChip>}
      {rejected > 0 && <StatusChip tone="danger">{rejected} rejetée{rejected > 1 ? "s" : ""}</StatusChip>}
    </div>
  );
}

/** Barre de progression de la validation (approuvées puis rejetées). */
function ValidationProgress({
  total,
  approved,
  rejected,
  progressPct,
}: {
  readonly total: number;
  readonly approved: number;
  readonly rejected: number;
  readonly progressPct: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs text-ink-muted">Progression de la validation</p>
        <p className="text-xs font-semibold text-ink-muted">{progressPct}%</p>
      </div>
      <div className="h-2 bg-surface-sunken rounded-full overflow-hidden flex">
        <div
          className="h-full bg-success transition-all duration-500"
          style={{ width: `${total > 0 ? (approved / total) * 100 : 0}%` }}
        />
        <div
          className="h-full bg-danger transition-all duration-500"
          style={{ width: `${total > 0 ? (rejected / total) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

export default function MediaEventDetail({
  event: initialEvent,
  churchId,
  thumbnailUrls: initialThumbnailUrls,
  canUpload,
  canManage,
}: {
  readonly event: MediaEvent;
  readonly churchId: string;
  readonly thumbnailUrls: Record<string, string>;
  readonly canUpload: boolean;
  readonly canManage: boolean;
}) {
  const router = useRouter();
  const [event, setEvent] = useState(initialEvent);
  const [thumbnailUrls, setThumbnailUrls] = useState(initialThumbnailUrls);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<MediaPhotoStatus | "">("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);

  // ── Edit mode ────────────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState(event.name);
  const [editPlanningEventId, setEditPlanningEventId] = useState<string>(event.planningEvent?.id ?? "");
  const [planningEvents, setPlanningEvents] = useState<PlanningEventOption[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function openEdit() {
    setEditName(event.name);
    setEditPlanningEventId(event.planningEvent?.id ?? "");
    setEditError(null);
    if (planningEvents.length === 0) {
      const res = await fetch(`/api/events?churchId=${churchId}`);
      if (res.ok) {
        const json = await res.json();
        setPlanningEvents(Array.isArray(json) ? json : (json.events ?? []));
      }
    }
    setEditMode(true);
  }

  async function saveEdit() {
    setEditSaving(true);
    setEditError(null);
    const res = await fetch(`/api/media-events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName.trim() || undefined,
        planningEventId: editPlanningEventId || null,
      }),
    });
    setEditSaving(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setEditError(json.error ?? "Erreur lors de la sauvegarde");
      return;
    }
    const updated = await res.json();
    setEvent((prev) => ({ ...prev, name: updated.name, planningEvent: updated.planningEvent ?? null }));
    setEditMode(false);
    router.refresh();
  }

  async function refreshEvent() {
    const res = await fetch(`/api/media-events/${event.id}`);
    const json = await res.json();
    if (res.ok) {
      setEvent((prev) => ({
        ...prev,
        ...json,
        photos: prev.photos,           // photos complètes gérées par refreshPhotos
        shareTokens: json.shareTokens ?? prev.shareTokens,
      }));
    }
    router.refresh();
  }

  async function refreshPhotos() {
    const res = await fetch(`/api/media-events/${event.id}/photos`);
    const json = await res.json();
    if (res.ok) {
      const photos: (Photo & { thumbnailUrl?: string | null })[] = json;
      const newUrls: Record<string, string> = {};
      photos.forEach((p) => { if (p.thumbnailUrl) newUrls[p.id] = p.thumbnailUrl; });
      setThumbnailUrls((prev) => ({ ...prev, ...newUrls }));
      setEvent((prev) => ({ ...prev, photos, _count: { ...prev._count, photos: photos.length } }));
    }
  }

  function requestDelete(photoIds: string[]) {
    if (photoIds.length === 0) return;
    setPendingDelete(photoIds);
  }

  async function deletePhotos(photoIds: string[]) {
    if (photoIds.length === 0) return;
    setPendingDelete(null);
    setLightboxIndex(null);
    setBulkLoading(true);
    setEvent((prev) => ({
      ...prev,
      photos: prev.photos.filter((p) => !photoIds.includes(p.id)),
      _count: { ...prev._count, photos: prev.photos.length - photoIds.length },
    }));
    setSelectedPhotoIds(new Set());
    await fetch(`/api/media-events/${event.id}/photos?photoIds=${photoIds.join(",")}`, {
      method: "DELETE",
    });
    setBulkLoading(false);
    refreshPhotos().catch(() => undefined);
  }

  async function deleteEvent() {
    await fetch(`/api/media-events/${event.id}`, { method: "DELETE" });
    router.push(paths.media.events());
  }

  function toggleSelect(id: string) {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Stats
  const allPhotos = event.photos;
  const pendingCount     = allPhotos.filter((p) => p.status === "PENDING").length;
  const approvedCount    = allPhotos.filter((p) => p.status === "APPROVED").length;
  const rejectedCount    = allPhotos.filter((p) => p.status === "REJECTED").length;
  const prevalidatedCount= allPhotos.filter((p) => p.status === "PREVALIDATED").length;
  const progressPct      = allPhotos.length > 0 ? Math.round(((approvedCount + rejectedCount) / allPhotos.length) * 100) : 0;

  const filteredPhotos = activeTab ? allPhotos.filter((p) => p.status === activeTab) : allPhotos;

  // Tabs config
  const tabs: { label: string; value: MediaPhotoStatus | ""; count: number; color: string }[] = [
    { label: "Toutes",        value: "",             count: allPhotos.length,    color: "text-ink-muted" },
    { label: "En attente",    value: "PENDING",      count: pendingCount,        color: "text-warning" },
    { label: "Approuvées",    value: "APPROVED",     count: approvedCount,       color: "text-success" },
    { label: "Rejetées",      value: "REJECTED",     count: rejectedCount,       color: "text-danger" },
    ...(prevalidatedCount > 0 ? [{ label: "Pré-validées", value: "PREVALIDATED" as MediaPhotoStatus, count: prevalidatedCount, color: "text-info" }] : []),
  ];

  const allSelected = filteredPhotos.length > 0 && selectedPhotoIds.size === filteredPhotos.length;
  const selectedPlural = selectedPhotoIds.size > 1 ? "s" : "";
  const selectionLabel =
    selectedPhotoIds.size > 0 ? `${selectedPhotoIds.size} sélectionnée${selectedPlural}` : "Tout sélectionner";

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div>
          <Link href={paths.media.events()} className={`${buttonClasses("ghost", "sm")} -ml-2 mb-3`}>
            <ChevronLeft className="size-4" aria-hidden="true" strokeWidth={1.75} />
            Retour aux événements
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-bold text-ink truncate">{event.name}</h1>
                <StatusChip tone={EVENT_STATUS_TONE[event.status]} className="shrink-0">
                  {EVENT_STATUS_LABELS[event.status]}
                </StatusChip>
              </div>
              <p className="text-sm text-ink-muted mt-1">{formatDate(event.date)}</p>
              {event.planningEvent && (
                <p className="text-[13px] text-ink-muted mt-1">
                  Lié à : {event.planningEvent.title}
                </p>
              )}
              {event.description && (
                <p className="text-sm text-ink-muted mt-2 leading-relaxed">{event.description}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {canManage && !editMode && (
                <Button type="button" variant="secondary" size="sm" onClick={openEdit}>
                  Modifier l&apos;événement
                </Button>
              )}
              {canManage && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDeleteEvent(true)}>
                  Supprimer l&apos;événement
                </Button>
              )}
            </div>
          </div>

          {/* ── Panneau d'édition ──────────────────────────────────────── */}
          {editMode && (
            <div className="mt-4 space-y-3">
              <Input label="Nom de l'événement" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nom de l'événement" />
              <Select
                label="Lier à un événement planning"
                value={editPlanningEventId}
                onChange={(e) => setEditPlanningEventId(e.target.value)}
                options={[
                  { value: "", label: "Aucun lien" },
                  ...planningEvents.map((pe) => ({
                    value: pe.id,
                    label: `${new Date(pe.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })} — ${pe.title}`,
                  })),
                ]}
              />
              {editError && <p className="text-[13px] text-danger">{editError}</p>}
              {!editName.trim() && <p className="text-[13px] text-ink-muted">Saisissez un nom pour enregistrer.</p>}
              <div className="flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditMode(false)} disabled={editSaving}>
                  Annuler
                </Button>
                <Button type="button" size="sm" onClick={saveEdit} disabled={editSaving || !editName.trim()}>
                  {editSaving ? "Enregistrement en cours…" : "Enregistrer les modifications"}
                </Button>
              </div>
            </div>
          )}

          {/* Stat pills */}
          <PhotoStatPills total={allPhotos.length} pending={pendingCount} approved={approvedCount} rejected={rejectedCount} />
        </div>

        {/* Progress bar */}
        {allPhotos.length > 0 && (
          <ValidationProgress total={allPhotos.length} approved={approvedCount} rejected={rejectedCount} progressPct={progressPct} />
        )}
      </div>

      {/* ── Liens de partage ──────────────────────────────────── */}
      {canManage && (
        <div>
          <ShareLinksHeading count={event.shareTokens.length} />
          <ShareTokenSection eventId={event.id} tokens={event.shareTokens} onRefresh={refreshEvent} />
        </div>
      )}

      {/* ── Photos ────────────────────────────────────────────── */}
      <div className="bg-surface rounded-card border border-line shadow-card">
        {/* Toolbar */}
        <div className="px-5 pt-4 pb-3 border-b border-line">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {tabs.map((tab) => (
                <FilterChip
                  key={tab.value}
                  pressed={activeTab === tab.value}
                  onClick={() => { setActiveTab(tab.value); setSelectedPhotoIds(new Set()); }}
                >
                  {tab.label}
                  <span className="text-xs font-semibold tabular-nums">{tab.count}</span>
                </FilterChip>
              ))}
            </div>
            {canUpload && (
              <UploadToggleButton active={showUpload} onClick={() => setShowUpload((v) => !v)} />
            )}
          </div>
        </div>

        {/* Bannière d'activité */}
        {(uploadProgress || bulkLoading) && <ActivityBanner uploadProgress={uploadProgress} />}

        {/* Upload zone (conditionnelle) */}
        {showUpload && (
          <div className="px-5 py-4 border-b border-line bg-bg">
            <PhotoUploadZone
              eventId={event.id}
              onUploaded={() => { setShowUpload(false); refreshPhotos().catch(() => undefined); }}
              onProgressChange={setUploadProgress}
            />
          </div>
        )}

        {/* Bulk actions bar */}
        {canUpload && filteredPhotos.length > 0 && (
          <div className="px-5 py-2 border-b border-line flex flex-wrap items-center gap-3">
            <label className="flex min-h-11 items-center gap-3 cursor-pointer select-none">
              <Checkbox
                checked={allSelected}
                onChange={() => {
                  if (allSelected) setSelectedPhotoIds(new Set());
                  else setSelectedPhotoIds(new Set(filteredPhotos.map((p) => p.id)));
                }}
              />
              <span className="text-sm text-ink-muted">
                {selectionLabel}
              </span>
            </label>
            {selectedPhotoIds.size > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <Button type="button" variant="secondary" size="sm" onClick={() => requestDelete(Array.from(selectedPhotoIds))} disabled={bulkLoading}>
                  <Trash2 className="size-4" aria-hidden="true" strokeWidth={1.75} />
                  {bulkLoading ? "Suppression en cours…" : `Supprimer la sélection (${selectedPhotoIds.size})`}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedPhotoIds(new Set())}>
                  Annuler la sélection
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Grid */}
        <div className="p-4">
          {filteredPhotos.length === 0 ? (
            <div className="text-center py-16 text-ink-subtle">
              <ImageIcon className="w-12 h-12 text-ink-subtle mx-auto mb-3" aria-hidden="true" />
              <p className="text-sm text-ink-subtle">
                {activeTab ? `Aucune photo "${PHOTO_STATUS_LABELS[activeTab as MediaPhotoStatus]}"` : "Aucune photo pour cet événement"}
              </p>
              {activeTab && (
                <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setActiveTab("")}>
                  Voir toutes les photos
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {filteredPhotos.map((photo) => {
                const isSelected = selectedPhotoIds.has(photo.id);
                const globalIndex = allPhotos.indexOf(photo);
                return (
                  <div
                    key={photo.id}
                    className={`relative group rounded-control overflow-hidden border-2 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                      isSelected
                        ? "border-brand ring-2 ring-focus/30"
                        : "border-transparent hover:border-line"
                    }`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        if (selectedPhotoIds.size > 0) toggleSelect(photo.id);
                        else setLightboxIndex(globalIndex);
                      }
                    }}
                    onClick={() => {
                      if (selectedPhotoIds.size > 0) toggleSelect(photo.id);
                      else setLightboxIndex(globalIndex);
                    }}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-square bg-surface-sunken overflow-hidden">
                      {thumbnailUrls[photo.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbnailUrls[photo.id]}
                          alt={photo.filename}
                          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-surface-sunken">
                          <ImageIcon className="w-6 h-6 text-ink-subtle" aria-hidden="true" />
                        </div>
                      )}
                    </div>

                    {/* Checkbox top-left (si canUpload) */}
                    {canUpload && (
                      <button
                        type="button"
                        aria-label={isSelected ? "Désélectionner la photo" : "Sélectionner la photo"}
                        aria-pressed={isSelected}
                        className={`absolute top-0 left-0 grid size-11 place-items-center rounded-control transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-focus ${isSelected || selectedPhotoIds.size > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                        onClick={(e) => { e.stopPropagation(); toggleSelect(photo.id); }}
                      >
                        <span className={`w-5 h-5 rounded-chip border-2 flex items-center justify-center transition-colors ${isSelected ? "bg-brand border-brand" : "bg-surface/90 border-control-line"}`}>
                          {isSelected && (
                            <Check className="w-3 h-3 text-on-brand" aria-hidden="true" />
                          )}
                        </span>
                      </button>
                    )}

                    {/* Status dot top-right */}
                    <div className="absolute top-1.5 right-1.5">
                      <span className={`block w-2 h-2 rounded-full shadow-card ${
                        PHOTO_STATUS_DOT_CLASS[photo.status] ?? "bg-warning"
                      }`} />
                    </div>

                    {/* Hover : bouton supprimer */}
                    {canUpload && selectedPhotoIds.size === 0 && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-scrim to-transparent py-2 px-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); requestDelete([photo.id]); }}
                          className={`${buttonClasses("secondary", "sm")} w-full`}
                        >
                          <Trash2 className="size-4" aria-hidden="true" strokeWidth={1.75} /> Supprimer la photo
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Lightbox ──────────────────────────────────────────── */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={allPhotos}
          initialIndex={lightboxIndex}
          thumbnailUrls={thumbnailUrls}
          canUpload={canUpload}
          onClose={() => setLightboxIndex(null)}
          onRequestDelete={(id) => requestDelete([id])}
        />
      )}

      {/* ── Modale de confirmation de suppression ─────────────── */}
      {pendingDelete !== null && (
        <ConfirmDeleteModal
          title={pendingDelete.length > 1 ? `Supprimer ${pendingDelete.length} photos ?` : "Supprimer cette photo ?"}
          message="Cette action est irréversible."
          onConfirm={() => deletePhotos(pendingDelete!)}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {confirmDeleteEvent && (
        <ConfirmDeleteModal
          title={`Supprimer "${event.name}" ?`}
          message="L'événement et toutes ses photos seront supprimés. Cette action est irréversible."
          onConfirm={deleteEvent}
          onCancel={() => setConfirmDeleteEvent(false)}
        />
      )}
    </div>
  );
}
