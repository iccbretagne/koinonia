"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import type { MediaEventStatus, MediaPhotoStatus, MediaTokenType } from "@/generated/prisma/enums";

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

const PHOTO_STATUS_COLORS: Record<MediaPhotoStatus, string> = {
  PENDING:      "bg-yellow-100 text-yellow-800",
  APPROVED:     "bg-green-100 text-green-800",
  REJECTED:     "bg-red-100 text-red-800",
  PREVALIDATED: "bg-blue-100 text-blue-800",
  PREREJECTED:  "bg-orange-100 text-orange-800",
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

const EVENT_STATUS_LABELS: Record<MediaEventStatus, string> = {
  DRAFT:         "Brouillon",
  PENDING_REVIEW:"En révision",
  REVIEWED:      "Validé",
  ARCHIVED:      "Archivé",
};

const EVENT_STATUS_COLORS: Record<MediaEventStatus, string> = {
  DRAFT:         "bg-gray-100 text-gray-600",
  PENDING_REVIEW:"bg-yellow-100 text-yellow-700",
  REVIEWED:      "bg-green-100 text-green-700",
  ARCHIVED:      "bg-gray-100 text-gray-500",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// ─── Upload zone ──────────────────────────────────────────────────────────────

function PhotoUploadZone({ eventId, onUploaded }: { eventId: string; onUploaded: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: File[]) {
    setUploading(true);
    setError(null);
    setProgress({ done: 0, total: files.length });
    let done = 0;
    const errors: string[] = [];
    for (const file of files) {
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/media-events/${eventId}/photos`, { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) errors.push(`${file.name}: ${json.error || "Erreur"}`);
      } catch {
        errors.push(`${file.name}: Erreur réseau`);
      }
      done++;
      setProgress({ done, total: files.length });
    }
    setUploading(false);
    setProgress(null);
    if (errors.length > 0) setError(errors.join("\n"));
    onUploaded();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      ["image/jpeg", "image/png", "image/webp"].includes(f.type)
    );
    if (files.length > 0) uploadFiles(files);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) uploadFiles(files);
    e.target.value = "";
  }

  return (
    <div
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => !uploading && inputRef.current?.click()}
      className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-icc-violet hover:bg-icc-violet/5 transition-all"
    >
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={onFileChange} />
      {uploading && progress ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">
            Envoi {progress.done}/{progress.total}…
          </p>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-icc-violet h-2 rounded-full transition-all"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <p className="text-sm text-gray-500">
            Glissez des photos ici ou <span className="text-icc-violet font-medium">cliquez pour choisir</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">JPEG, PNG, WebP</p>
        </>
      )}
      {error && <p className="mt-2 text-xs text-red-600 whitespace-pre-line">{error}</p>}
    </div>
  );
}

// ─── Liens de partage ─────────────────────────────────────────────────────────

function ShareTokenSection({ eventId, tokens, onRefresh }: {
  eventId: string;
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
    if (!confirm("Supprimer ce lien de partage ?")) return;
    await fetch(`/api/media-events/${eventId}/share?tokenId=${tokenId}`, { method: "DELETE" });
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
                onClick={() => deleteToken(token.id)}
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
              placeholder="Ex : Validateurs familles"
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
  );
}

// ─── Confirmation de suppression ─────────────────────────────────────────────

function ConfirmDeleteModal({ count, onConfirm, onCancel }: {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-gray-900">Supprimer {count > 1 ? `${count} photos` : "cette photo"} ?</p>
            <p className="text-sm text-gray-500 mt-0.5">Cette action est irréversible.</p>
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
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function PhotoLightbox({ photos, initialIndex, thumbnailUrls, canUpload, onClose, onRequestDelete }: {
  photos: Photo[];
  initialIndex: number;
  thumbnailUrls: Record<string, string>;
  canUpload: boolean;
  onClose: () => void;
  onRequestDelete: (photoId: string) => void;
}) {
  const [index, setIndex] = useState(initialIndex);

  const photo = photos[index];
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  const go = useCallback((dir: 1 | -1) => {
    setIndex((i) => Math.max(0, Math.min(photos.length - 1, i + dir)));
  }, [photos.length]);

  function handleDelete() {
    onRequestDelete(photo.id);
  }

  // Advance to next photo or close when the current one is removed
  useEffect(() => {
    if (!photos.find((p) => p === photo)) {
      if (hasNext) go(1);
      else onClose();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col" onClick={onClose}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-5 py-3 bg-black/60 backdrop-blur-sm shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${PHOTO_STATUS_COLORS[photo.status]}`}>
            {PHOTO_STATUS_LABELS[photo.status]}
          </span>
          <p className="text-sm text-white/70 truncate">{photo.filename}</p>
          <span className="text-xs text-white/40 shrink-0">{formatSize(photo.size)}</span>
        </div>
        <div className="flex items-center gap-4 shrink-0 ml-4">
          <span className="text-sm text-white/50">{index + 1} / {photos.length}</span>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Image + navigation */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden p-4" onClick={(e) => e.stopPropagation()}>
        {hasPrev && (
          <button
            onClick={() => go(-1)}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/40 hover:bg-black/70 flex items-center justify-center text-white text-xl font-light transition-colors z-10 backdrop-blur-sm"
          >
            ‹
          </button>
        )}
        {thumbnailUrls[photo.id] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={photo.id}
            src={thumbnailUrls[photo.id]}
            alt={photo.filename}
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
          />
        ) : (
          <div className="w-64 h-64 bg-gray-800 rounded-xl flex items-center justify-center text-gray-500 text-sm">
            Aperçu indisponible
          </div>
        )}
        {hasNext && (
          <button
            onClick={() => go(1)}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/40 hover:bg-black/70 flex items-center justify-center text-white text-xl font-light transition-colors z-10 backdrop-blur-sm"
          >
            ›
          </button>
        )}
      </div>

      {/* Bottom bar */}
      <div
        className="shrink-0 flex items-center justify-center gap-4 py-4 px-5 bg-black/60 backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${PHOTO_STATUS_COLORS[photo.status]}`}>
          {PHOTO_STATUS_LABELS[photo.status]}
        </span>
        {canUpload && (
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-white text-sm font-medium transition-colors"
          >
            🗑 Supprimer
          </button>
        )}
        <span className="text-xs text-white/30 hidden sm:block">← → naviguer · Échap fermer</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MediaEventDetail({
  event: initialEvent,
  thumbnailUrls: initialThumbnailUrls,
  canUpload,
  canManage,
}: {
  event: MediaEvent;
  thumbnailUrls: Record<string, string>;
  canUpload: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [event, setEvent] = useState(initialEvent);
  const [thumbnailUrls, setThumbnailUrls] = useState(initialThumbnailUrls);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<MediaPhotoStatus | "">("");
  const [bulkLoading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);

  async function refreshEvent() {
    const res = await fetch(`/api/media-events/${event.id}`);
    const json = await res.json();
    if (res.ok) setEvent({ ...event, ...json, photos: json.photos ?? event.photos, shareTokens: json.shareTokens ?? event.shareTokens });
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
    // Mise à jour optimiste
    setEvent((prev) => ({
      ...prev,
      photos: prev.photos.filter((p) => !photoIds.includes(p.id)),
      _count: { ...prev._count, photos: prev.photos.length - photoIds.length },
    }));
    setSelectedPhotoIds(new Set());
    await fetch(`/api/media-events/${event.id}/photos?photoIds=${photoIds.join(",")}`, {
      method: "DELETE",
    });
    refreshPhotos(); // synchronise en arrière-plan
  }

  async function deleteEvent() {
    if (!confirm(`Supprimer l'événement "${event.name}" et toutes ses photos ?`)) return;
    await fetch(`/api/media-events/${event.id}`, { method: "DELETE" });
    router.push("/media/events");
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
    { label: "Toutes",        value: "",             count: allPhotos.length,    color: "text-gray-600" },
    { label: "En attente",    value: "PENDING",      count: pendingCount,        color: "text-yellow-700" },
    { label: "Approuvées",    value: "APPROVED",     count: approvedCount,       color: "text-green-700" },
    { label: "Rejetées",      value: "REJECTED",     count: rejectedCount,       color: "text-red-700" },
    ...(prevalidatedCount > 0 ? [{ label: "Pré-validées", value: "PREVALIDATED" as MediaPhotoStatus, count: prevalidatedCount, color: "text-blue-700" }] : []),
  ];

  const allSelected = filteredPhotos.length > 0 && selectedPhotoIds.size === filteredPhotos.length;

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5">
          <Link href="/media/events" className="text-xs text-gray-400 hover:text-icc-violet transition-colors inline-flex items-center gap-1 mb-3">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Événements
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900 truncate">{event.name}</h1>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold shrink-0 ${EVENT_STATUS_COLORS[event.status]}`}>
                  {EVENT_STATUS_LABELS[event.status]}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">{formatDate(event.date)}</p>
              {event.planningEvent && (
                <p className="text-xs text-icc-violet mt-1">
                  📅 Lié à : {event.planningEvent.title}
                </p>
              )}
              {event.description && (
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">{event.description}</p>
              )}
            </div>
            {canManage && (
              <button
                onClick={deleteEvent}
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs font-semibold text-gray-700">{allPhotos.length}</span>
              <span className="text-xs text-gray-500">photo{allPhotos.length !== 1 ? "s" : ""}</span>
            </div>
            {pendingCount > 0 && (
              <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" />
                <span className="text-xs font-semibold text-yellow-800">{pendingCount}</span>
                <span className="text-xs text-yellow-700">en attente</span>
              </div>
            )}
            {approvedCount > 0 && (
              <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                <span className="text-xs font-semibold text-green-800">{approvedCount}</span>
                <span className="text-xs text-green-700">approuvée{approvedCount > 1 ? "s" : ""}</span>
              </div>
            )}
            {rejectedCount > 0 && (
              <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                <span className="text-xs font-semibold text-red-800">{rejectedCount}</span>
                <span className="text-xs text-red-700">rejetée{rejectedCount > 1 ? "s" : ""}</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {allPhotos.length > 0 && (
          <div className="px-5 pb-4">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-gray-500">Progression de la validation</p>
              <p className="text-xs font-semibold text-gray-700">{progressPct}%</p>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-green-500 transition-all duration-500"
                style={{ width: `${allPhotos.length > 0 ? (approvedCount / allPhotos.length) * 100 : 0}%` }}
              />
              <div
                className="h-full bg-red-400 transition-all duration-500"
                style={{ width: `${allPhotos.length > 0 ? (rejectedCount / allPhotos.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Liens de partage ──────────────────────────────────── */}
      {canManage && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-icc-violet" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Liens de partage
            {event.shareTokens.length > 0 && (
              <span className="ml-auto text-xs text-gray-400 font-normal">{event.shareTokens.length} lien{event.shareTokens.length > 1 ? "s" : ""}</span>
            )}
          </h2>
          <ShareTokenSection eventId={event.id} tokens={event.shareTokens} onRefresh={refreshEvent} />
        </div>
      )}

      {/* ── Photos ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        {/* Toolbar */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1 flex-wrap">
              {tabs.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => { setActiveTab(tab.value); setSelectedPhotoIds(new Set()); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab.value
                      ? "bg-icc-violet text-white"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {tab.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-md font-semibold ${
                    activeTab === tab.value ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
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

        {/* Upload zone (conditionnelle) */}
        {showUpload && (
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
            <PhotoUploadZone eventId={event.id} onUploaded={() => { setShowUpload(false); refreshPhotos(); }} />
          </div>
        )}

        {/* Bulk actions bar */}
        {canUpload && filteredPhotos.length > 0 && (
          <div className="px-5 py-2.5 border-b border-gray-100 flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => {
                  if (allSelected) setSelectedPhotoIds(new Set());
                  else setSelectedPhotoIds(new Set(filteredPhotos.map((p) => p.id)));
                }}
                className="w-4 h-4 rounded border-gray-300 accent-icc-violet"
              />
              <span className="text-xs text-gray-500">
                {selectedPhotoIds.size > 0
                  ? `${selectedPhotoIds.size} sélectionnée${selectedPhotoIds.size > 1 ? "s" : ""}`
                  : "Tout sélectionner"}
              </span>
            </label>
            {selectedPhotoIds.size > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => requestDelete(Array.from(selectedPhotoIds))}
                  disabled={bulkLoading}
                  className="flex items-center gap-1.5 text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors font-medium"
                >
                  🗑 Supprimer ({selectedPhotoIds.size})
                </button>
                <button
                  onClick={() => setSelectedPhotoIds(new Set())}
                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5"
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
        )}

        {/* Grid */}
        <div className="p-4">
          {filteredPhotos.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm text-gray-400">
                {activeTab ? `Aucune photo "${PHOTO_STATUS_LABELS[activeTab as MediaPhotoStatus]}"` : "Aucune photo pour cet événement"}
              </p>
              {activeTab && (
                <button onClick={() => setActiveTab("")} className="mt-2 text-xs text-icc-violet hover:underline">
                  Voir toutes les photos
                </button>
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
                    className={`relative group rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                      isSelected
                        ? "border-icc-violet ring-2 ring-icc-violet/30"
                        : "border-transparent hover:border-gray-200"
                    }`}
                    onClick={() => {
                      if (selectedPhotoIds.size > 0) toggleSelect(photo.id);
                      else setLightboxIndex(globalIndex);
                    }}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-square bg-gray-100 overflow-hidden">
                      {thumbnailUrls[photo.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbnailUrls[photo.id]}
                          alt={photo.filename}
                          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-100">
                          <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Checkbox top-left (si canUpload) */}
                    {canUpload && (
                      <div
                        className={`absolute top-1.5 left-1.5 transition-opacity ${isSelected || selectedPhotoIds.size > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                        onClick={(e) => { e.stopPropagation(); toggleSelect(photo.id); }}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? "bg-icc-violet border-icc-violet" : "bg-white/90 border-gray-300"}`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Status dot top-right */}
                    <div className="absolute top-1.5 right-1.5">
                      <span className={`block w-2 h-2 rounded-full shadow-sm ${
                        photo.status === "APPROVED"     ? "bg-green-500" :
                        photo.status === "REJECTED"     ? "bg-red-500" :
                        photo.status === "PREVALIDATED" ? "bg-blue-500" :
                        photo.status === "PREREJECTED"  ? "bg-orange-500" :
                        "bg-yellow-400"
                      }`} />
                    </div>

                    {/* Hover : bouton supprimer */}
                    {canUpload && selectedPhotoIds.size === 0 && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent py-2 px-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); requestDelete([photo.id]); }}
                          className="w-full text-xs bg-red-600/80 hover:bg-red-600 text-white rounded-lg py-1.5 transition-colors font-medium"
                        >
                          🗑 Supprimer
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
          count={pendingDelete.length}
          onConfirm={() => deletePhotos(pendingDelete!)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
