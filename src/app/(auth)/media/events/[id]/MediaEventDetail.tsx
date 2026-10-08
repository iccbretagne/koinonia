"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";
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
  PENDING:      "bg-warning-soft text-warning",
  APPROVED:     "bg-success-soft text-success",
  REJECTED:     "bg-danger-soft text-danger",
  PREVALIDATED: "bg-info-soft text-info",
  PREREJECTED:  "bg-warning-soft text-warning",
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

const EVENT_STATUS_COLORS: Record<MediaEventStatus, string> = {
  DRAFT:         "bg-surface-sunken text-ink-muted",
  PENDING_REVIEW:"bg-warning-soft text-warning",
  REVIEWED:      "bg-success-soft text-success",
  ARCHIVED:      "bg-surface-sunken text-ink-muted",
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
      className="block w-full border-2 border-dashed border-control-line rounded-xl p-6 text-center cursor-pointer hover:border-brand hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-focus outline-none transition-all"
    >
      {uploading && progress ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink-muted">
            Envoi {progress.done}/{progress.total}…
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
          <svg className="w-8 h-8 text-ink-subtle mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <p className="text-sm text-ink-muted">
            Glissez des photos ici ou <span className="text-brand-text font-medium">cliquez pour choisir</span>
          </p>
          <p className="text-xs text-ink-subtle mt-1">JPEG, PNG, WebP</p>
        </>
      )}
      {error && <p className="mt-2 text-xs text-danger whitespace-pre-line">{error}</p>}
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
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newType, setNewType] = useState<MediaTokenType>("GALLERY");
  const [newLabel, setNewLabel] = useState("");
  const [newExpiry, setNewExpiry] = useState("7");
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [pendingDeleteTokenId, setPendingDeleteTokenId] = useState<string | null>(null);
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
    const paths: Record<MediaTokenType, string> = { VALIDATOR: "v", PREVALIDATOR: "v", MEDIA: "d", MEDIA_ALL: "d", GALLERY: "g", COLLECTION: "c" };
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
        <p className="text-sm text-ink-subtle text-center py-2">Aucun lien de partage</p>
      )}

      {tokens.map((token) => {
        const url = getTokenUrl(token);
        const isExpired = token.expiresAt && new Date(token.expiresAt) < new Date();
        return (
          <div key={token.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${isExpired ? "bg-danger-soft border-danger/30 opacity-70" : "bg-surface-sunken border-line"}`}>
            <span className="text-lg shrink-0">{TOKEN_TYPE_ICONS[token.type]}</span>
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
              <button
                onClick={() => copy(url, token.id)}
                className={`text-xs border rounded-lg px-2.5 py-1.5 transition-colors ${copied === token.id ? "bg-success-soft border-success/30 text-success" : "border-line text-ink-muted hover:text-brand-text hover:border-brand"}`}
              >
                {copied === token.id ? "✓ Copié" : "Copier"}
              </button>
              <button
                onClick={() => setPendingDeleteTokenId(token.id)}
                className="text-xs text-danger hover:text-danger border border-danger/30 hover:bg-danger-soft rounded-lg px-2.5 py-1.5 transition-colors"
              >
                Suppr.
              </button>
            </div>
          </div>
        );
      })}

      {open ? (
        <div className="p-4 border border-brand/30 rounded-xl bg-brand-soft space-y-3">
          <p className="text-sm font-medium text-ink-muted">Nouveau lien de partage</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${fieldId}-type`} className="text-xs text-ink-muted mb-1 block">Type</label>
              <select
                id={`${fieldId}-type`}
                value={newType}
                onChange={(e) => setNewType(e.target.value as MediaTokenType)}
                className="w-full border border-control-line rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-focus bg-surface"
              >
                {(Object.keys(TOKEN_TYPE_LABELS) as MediaTokenType[]).map((t) => (
                  <option key={t} value={t}>{TOKEN_TYPE_ICONS[t]} {TOKEN_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${fieldId}-expiry`} className="text-xs text-ink-muted mb-1 block">Durée (0 = illimité)</label>
              <div className="relative">
                <input
                  id={`${fieldId}-expiry`}
                  type="number"
                  min="0"
                  value={newExpiry}
                  onChange={(e) => setNewExpiry(e.target.value)}
                  className="w-full border border-control-line rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-subtle pointer-events-none">jours</span>
              </div>
            </div>
          </div>
          <div>
            <label htmlFor={`${fieldId}-label`} className="text-xs text-ink-muted mb-1 block">Étiquette (optionnel)</label>
            <input
              id={`${fieldId}-label`}
              type="text"
              placeholder="Ex : Validateurs familles"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="w-full border border-control-line rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setOpen(false); setError(null); }} className="text-sm text-ink-muted hover:text-ink-muted px-3 py-1.5">
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
          className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-control-line rounded-xl py-2.5 text-sm text-ink-muted hover:border-brand hover:text-brand-text transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Ajouter un lien
        </button>
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-scrim backdrop-blur-sm" aria-hidden="true" onClick={onCancel} />
      <div className="relative bg-surface rounded-2xl shadow-overlay max-w-sm w-full p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-danger-soft flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-ink">{title}</p>
            <p className="text-sm text-ink-muted mt-0.5">{message}</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-ink-muted hover:text-ink border border-line hover:border-control-line rounded-xl transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-on-danger bg-danger hover:bg-danger/90 rounded-xl transition-colors"
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
  readonly photos: Photo[];
  readonly initialIndex: number;
  readonly thumbnailUrls: Record<string, string>;
  readonly canUpload: boolean;
  readonly onClose: () => void;
  readonly onRequestDelete: (photoId: string) => void;
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
    if (!photos.includes(photo)) {
      if (hasNext) go(1);
      else onClose();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Visionneuse plein écran toujours sombre : les couleurs fixes (white/black) ci-dessous
  // sont volontaires, indépendantes du thème (cf. docs/design-system/migration.md).
  return (
    // eslint-disable-next-line no-restricted-syntax -- visionneuse photo plein écran toujours sombre
    <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col" role="none" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-5 py-3 bg-scrim backdrop-blur-sm shrink-0"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${PHOTO_STATUS_COLORS[photo.status]}`}>
            {PHOTO_STATUS_LABELS[photo.status]}
          </span>
          {/* eslint-disable-next-line no-restricted-syntax -- visionneuse photo plein écran toujours sombre */}
          <p className="text-sm text-white/70 truncate">{photo.filename}</p>
          {/* eslint-disable-next-line no-restricted-syntax -- visionneuse photo plein écran toujours sombre */}
          <span className="text-xs text-white/40 shrink-0">{formatSize(photo.size)}</span>
        </div>
        <div className="flex items-center gap-4 shrink-0 ml-4">
          {/* eslint-disable-next-line no-restricted-syntax -- visionneuse photo plein écran toujours sombre */}
          <span className="text-sm text-white/50">{index + 1} / {photos.length}</span>
          {/* eslint-disable-next-line no-restricted-syntax -- visionneuse photo plein écran toujours sombre */}
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Image + navigation */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden p-4">
        {hasPrev && (
          <button
            onClick={() => go(-1)}
            // eslint-disable-next-line no-restricted-syntax -- visionneuse photo plein écran toujours sombre
            className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-scrim hover:bg-black/70 flex items-center justify-center text-white text-xl font-light transition-colors z-10 backdrop-blur-sm"
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
            className="max-w-full max-h-full object-contain rounded-xl shadow-overlay"
          />
        ) : (
          <div className="w-64 h-64 bg-control-line rounded-xl flex items-center justify-center text-ink-muted text-sm">
            Aperçu indisponible
          </div>
        )}
        {hasNext && (
          <button
            onClick={() => go(1)}
            // eslint-disable-next-line no-restricted-syntax -- visionneuse photo plein écran toujours sombre
            className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-scrim hover:bg-black/70 flex items-center justify-center text-white text-xl font-light transition-colors z-10 backdrop-blur-sm"
          >
            ›
          </button>
        )}
      </div>

      {/* Bottom bar */}
      <div
        className="shrink-0 flex items-center justify-center gap-4 py-4 px-5 bg-scrim backdrop-blur-sm"
      >
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${PHOTO_STATUS_COLORS[photo.status]}`}>
          {PHOTO_STATUS_LABELS[photo.status]}
        </span>
        {canUpload && (
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-danger/80 hover:bg-danger text-on-danger text-sm font-medium transition-colors"
          >
            🗑 Supprimer
          </button>
        )}
        {/* eslint-disable-next-line no-restricted-syntax -- visionneuse photo plein écran toujours sombre */}
        <span className="text-xs text-white/30 hidden sm:block">← → naviguer · Échap fermer</span>
      </div>
    </div>
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
              Upload en cours · {uploadProgress.done}/{uploadProgress.total} photo{uploadProgress.total > 1 ? "s" : ""}
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
      <div className="flex items-center gap-1.5 bg-surface-sunken border border-line rounded-lg px-3 py-1.5">
        <svg className="w-3.5 h-3.5 text-ink-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="text-xs font-semibold text-ink-muted">{total}</span>
        <span className="text-xs text-ink-muted">photo{total !== 1 ? "s" : ""}</span>
      </div>
      {pending > 0 && (
        <div className="flex items-center gap-1.5 bg-warning-soft border border-warning/30 rounded-lg px-3 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
          <span className="text-xs font-semibold text-warning">{pending}</span>
          <span className="text-xs text-warning">en attente</span>
        </div>
      )}
      {approved > 0 && (
        <div className="flex items-center gap-1.5 bg-success-soft border border-success/30 rounded-lg px-3 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
          <span className="text-xs font-semibold text-success">{approved}</span>
          <span className="text-xs text-success">approuvée{approved > 1 ? "s" : ""}</span>
        </div>
      )}
      {rejected > 0 && (
        <div className="flex items-center gap-1.5 bg-danger-soft border border-danger/30 rounded-lg px-3 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-danger shrink-0" />
          <span className="text-xs font-semibold text-danger">{rejected}</span>
          <span className="text-xs text-danger">rejetée{rejected > 1 ? "s" : ""}</span>
        </div>
      )}
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
    <div className="px-5 pb-4">
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
  const editId = useId();
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
      <div className="bg-surface rounded-2xl border border-line shadow-card overflow-hidden">
        <div className="p-5">
          <Link href="/media/events" className="text-xs text-ink-subtle hover:text-brand-text transition-colors inline-flex items-center gap-1 mb-3">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Événements
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-bold text-ink truncate">{event.name}</h1>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold shrink-0 ${EVENT_STATUS_COLORS[event.status]}`}>
                  {EVENT_STATUS_LABELS[event.status]}
                </span>
              </div>
              <p className="text-sm text-ink-muted mt-1">{formatDate(event.date)}</p>
              {event.planningEvent && (
                <p className="text-xs text-brand-text mt-1">
                  📅 Lié à : {event.planningEvent.title}
                </p>
              )}
              {event.description && (
                <p className="text-sm text-ink-muted mt-2 leading-relaxed">{event.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canManage && !editMode && (
                <button
                  onClick={openEdit}
                  className="text-xs text-brand-text hover:text-brand-text/80 border border-brand/30 hover:border-brand/60 rounded-lg px-3 py-2 hover:bg-brand-soft transition-colors"
                >
                  Modifier
                </button>
              )}
              {canManage && (
                <button
                  onClick={() => setConfirmDeleteEvent(true)}
                  className="text-xs text-danger hover:text-danger border border-danger/30 hover:border-danger/30 rounded-lg px-3 py-2 hover:bg-danger-soft transition-colors"
                >
                  Supprimer
                </button>
              )}
            </div>
          </div>

          {/* ── Panneau d'édition ──────────────────────────────────────── */}
          {editMode && (
            <div className="mt-4 p-4 bg-surface-sunken border border-line rounded-xl space-y-3">
              <div>
                <label htmlFor={`${editId}-name`} className="text-xs font-medium text-ink-muted block mb-1">Nom de l&apos;événement</label>
                <input
                  id={`${editId}-name`}
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border border-control-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand"
                  placeholder="Nom de l'événement"
                />
              </div>
              <div>
                <label htmlFor={`${editId}-planning`} className="text-xs font-medium text-ink-muted block mb-1">Lier à un événement planning</label>
                <select
                  id={`${editId}-planning`}
                  value={editPlanningEventId}
                  onChange={(e) => setEditPlanningEventId(e.target.value)}
                  className="w-full border border-control-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand bg-surface"
                >
                  <option value="">— Aucun lien —</option>
                  {planningEvents.map((pe) => (
                    <option key={pe.id} value={pe.id}>
                      {new Date(pe.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })} — {pe.title}
                    </option>
                  ))}
                </select>
              </div>
              {editError && <p className="text-xs text-danger">{editError}</p>}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setEditMode(false)}
                  className="text-xs px-4 py-2 rounded-lg border border-line text-ink-muted hover:bg-surface-sunken transition-colors"
                  disabled={editSaving}
                >
                  Annuler
                </button>
                <button
                  onClick={saveEdit}
                  disabled={editSaving || !editName.trim()}
                  className="text-xs px-4 py-2 rounded-lg bg-brand text-on-brand font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
                >
                  {editSaving ? "Enregistrement…" : "Enregistrer"}
                </button>
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
        <div className="bg-surface rounded-2xl border border-line shadow-card p-5">
          <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-brand-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Liens de partage
            {event.shareTokens.length > 0 && (
              <span className="ml-auto text-xs text-ink-subtle font-normal">{event.shareTokens.length} lien{event.shareTokens.length > 1 ? "s" : ""}</span>
            )}
          </h2>
          <ShareTokenSection eventId={event.id} tokens={event.shareTokens} onRefresh={refreshEvent} />
        </div>
      )}

      {/* ── Photos ────────────────────────────────────────────── */}
      <div className="bg-surface rounded-2xl border border-line shadow-card">
        {/* Toolbar */}
        <div className="px-5 pt-4 pb-3 border-b border-line">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1 flex-wrap">
              {tabs.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => { setActiveTab(tab.value); setSelectedPhotoIds(new Set()); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab.value
                      ? "bg-brand text-on-brand"
                      : "text-ink-muted hover:bg-surface-sunken"
                  }`}
                >
                  {tab.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-md font-semibold ${
                    activeTab === tab.value ? "bg-on-brand/20 text-on-brand" : "bg-surface-sunken text-ink-muted"
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
                    ? "border-brand text-brand-text bg-brand-soft"
                    : "border-line text-ink-muted hover:border-control-line hover:bg-surface-sunken"
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

        {/* Bannière d'activité */}
        {(uploadProgress || bulkLoading) && <ActivityBanner uploadProgress={uploadProgress} />}

        {/* Upload zone (conditionnelle) */}
        {showUpload && (
          <div className="px-5 py-4 border-b border-line bg-surface-sunken/50">
            <PhotoUploadZone
              eventId={event.id}
              onUploaded={() => { setShowUpload(false); refreshPhotos().catch(() => undefined); }}
              onProgressChange={setUploadProgress}
            />
          </div>
        )}

        {/* Bulk actions bar */}
        {canUpload && filteredPhotos.length > 0 && (
          <div className="px-5 py-2.5 border-b border-line flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => {
                  if (allSelected) setSelectedPhotoIds(new Set());
                  else setSelectedPhotoIds(new Set(filteredPhotos.map((p) => p.id)));
                }}
                className="w-4 h-4 rounded border-control-line accent-brand"
              />
              <span className="text-xs text-ink-muted">
                {selectionLabel}
              </span>
            </label>
            {selectedPhotoIds.size > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => requestDelete(Array.from(selectedPhotoIds))}
                  disabled={bulkLoading}
                  className="flex items-center gap-1.5 text-xs bg-danger hover:bg-danger/90 text-on-danger px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors font-medium"
                >
                  🗑 Supprimer ({selectedPhotoIds.size})
                </button>
                <button
                  onClick={() => setSelectedPhotoIds(new Set())}
                  className="text-xs text-ink-muted hover:text-ink-muted px-2 py-1.5"
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
            <div className="text-center py-16 text-ink-subtle">
              <svg className="w-12 h-12 text-ink-subtle mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm text-ink-subtle">
                {activeTab ? `Aucune photo "${PHOTO_STATUS_LABELS[activeTab as MediaPhotoStatus]}"` : "Aucune photo pour cet événement"}
              </p>
              {activeTab && (
                <button onClick={() => setActiveTab("")} className="mt-2 text-xs text-brand-text hover:underline">
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
                    className={`relative group rounded-xl overflow-hidden border-2 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-focus outline-none ${
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
                          <svg className="w-6 h-6 text-ink-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Checkbox top-left (si canUpload) */}
                    {canUpload && (
                      <button
                        type="button"
                        aria-label={isSelected ? "Désélectionner la photo" : "Sélectionner la photo"}
                        aria-pressed={isSelected}
                        className={`absolute top-1.5 left-1.5 transition-opacity focus-visible:opacity-100 ${isSelected || selectedPhotoIds.size > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                        onClick={(e) => { e.stopPropagation(); toggleSelect(photo.id); }}
                      >
                        <span className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? "bg-brand border-brand" : "bg-surface/90 border-control-line"}`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-on-brand" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
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
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent py-2 px-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); requestDelete([photo.id]); }}
                          className="w-full text-xs bg-danger/80 hover:bg-danger text-on-danger rounded-lg py-1.5 transition-colors font-medium"
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
