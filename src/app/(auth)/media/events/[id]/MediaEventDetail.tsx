"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import type { MediaEventStatus, MediaPhotoStatus, MediaTokenType } from "@/generated/prisma/enums";

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

const PHOTO_STATUS_LABELS: Record<MediaPhotoStatus, string> = {
  PENDING: "En attente",
  APPROVED: "Approuvée",
  REJECTED: "Rejetée",
  PREVALIDATED: "Pré-validée",
  PREREJECTED: "Pré-rejetée",
};

const PHOTO_STATUS_COLORS: Record<MediaPhotoStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  PREVALIDATED: "bg-blue-100 text-blue-800",
  PREREJECTED: "bg-orange-100 text-orange-800",
};

const TOKEN_TYPE_LABELS: Record<MediaTokenType, string> = {
  VALIDATOR: "Validateur",
  PREVALIDATOR: "Pré-validateur",
  MEDIA: "Téléchargement",
  GALLERY: "Galerie",
};

const EVENT_STATUS_LABELS: Record<MediaEventStatus, string> = {
  DRAFT: "Brouillon",
  PENDING_REVIEW: "En révision",
  REVIEWED: "Validé",
  ARCHIVED: "Archivé",
};

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// ── Upload zone ───────────────────────────────────────────

function PhotoUploadZone({
  eventId,
  onUploaded,
}: {
  eventId: string;
  onUploaded: () => void;
}) {
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
        const res = await fetch(`/api/media-events/${eventId}/photos`, {
          method: "POST",
          body: form,
        });
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
      onClick={() => inputRef.current?.click()}
      className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-icc-violet transition-colors"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={onFileChange}
      />
      {uploading && progress ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">
            Upload {progress.done}/{progress.total}…
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
          <svg className="w-10 h-10 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-gray-600">
            Glissez des photos ici ou <span className="text-icc-violet font-medium">cliquez pour choisir</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">JPEG, PNG, WebP — max 50 Mo par photo</p>
        </>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-600 whitespace-pre-line">{error}</p>
      )}
    </div>
  );
}

// ── Share token management ────────────────────────────────

function ShareTokenSection({
  eventId,
  tokens,
  onRefresh,
}: {
  eventId: string;
  tokens: ShareToken[];
  onRefresh: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newType, setNewType] = useState<MediaTokenType>("GALLERY");
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function createToken() {
    setError(null);
    setCreating(true);
    try {
      const res = await fetch(`/api/media-events/${eventId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: newType, label: newLabel || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      setNewLabel("");
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
    const paths: Record<MediaTokenType, string> = {
      VALIDATOR: "v",
      PREVALIDATOR: "v",
      MEDIA: "d",
      GALLERY: "g",
    };
    return `${window.location.origin}/media/${paths[token.type]}/${token.token}`;
  }

  return (
    <div className="space-y-3">
      {tokens.map((token) => (
        <div key={token.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium bg-icc-violet/10 text-icc-violet px-2 py-0.5 rounded">
                {TOKEN_TYPE_LABELS[token.type]}
              </span>
              {token.label && <span className="text-sm text-gray-700">{token.label}</span>}
            </div>
            <p className="text-xs text-gray-500 mt-1 truncate font-mono">{getTokenUrl(token)}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {token.usageCount} utilisation{token.usageCount > 1 ? "s" : ""}
              {token.expiresAt && ` · expire le ${formatDate(token.expiresAt)}`}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => navigator.clipboard.writeText(getTokenUrl(token))}
              className="text-xs text-gray-500 hover:text-icc-violet border border-gray-200 rounded px-2 py-1"
            >
              Copier
            </button>
            <button
              onClick={() => deleteToken(token.id)}
              className="text-xs text-red-600 hover:text-red-700 border border-red-200 rounded px-2 py-1"
            >
              Suppr.
            </button>
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value as MediaTokenType)}
          className="border-2 border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
        >
          {(Object.keys(TOKEN_TYPE_LABELS) as MediaTokenType[]).map((t) => (
            <option key={t} value={t}>{TOKEN_TYPE_LABELS[t]}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Étiquette (optionnel)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className="flex-1 border-2 border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
        />
        <Button onClick={createToken} disabled={creating} size="sm">
          {creating ? "…" : "+ Lien"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────

export default function MediaEventDetail({
  event: initialEvent,
  thumbnailUrls: initialThumbnailUrls,
  canUpload,
  canReview,
  canManage,
}: {
  event: MediaEvent;
  thumbnailUrls: Record<string, string>;
  canUpload: boolean;
  canReview: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [event, setEvent] = useState(initialEvent);
  const [thumbnailUrls, setThumbnailUrls] = useState(initialThumbnailUrls);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [photoFilter, setPhotoFilter] = useState<MediaPhotoStatus | "">("");
  const [bulkLoading, setBulkLoading] = useState(false);

  async function refreshEvent() {
    const res = await fetch(`/api/media-events/${event.id}`);
    const json = await res.json();
    if (res.ok) setEvent({ ...event, ...json.data, photos: json.data.photos ?? event.photos, shareTokens: json.data.shareTokens ?? event.shareTokens });
    router.refresh();
  }

  async function refreshPhotos() {
    const res = await fetch(`/api/media-events/${event.id}/photos`);
    const json = await res.json();
    if (res.ok) {
      const photos: (Photo & { thumbnailUrl?: string | null })[] = json.data;
      const newUrls: Record<string, string> = {};
      photos.forEach((p) => { if (p.thumbnailUrl) newUrls[p.id] = p.thumbnailUrl; });
      setThumbnailUrls((prev) => ({ ...prev, ...newUrls }));
      setEvent((prev) => ({ ...prev, photos, _count: { ...prev._count, photos: photos.length } }));
    }
  }

  const filteredPhotos = event.photos.filter((p) =>
    !photoFilter || p.status === photoFilter
  );

  function toggleSelect(id: string) {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedPhotoIds.size === filteredPhotos.length) {
      setSelectedPhotoIds(new Set());
    } else {
      setSelectedPhotoIds(new Set(filteredPhotos.map((p) => p.id)));
    }
  }

  async function bulkAction(status: "APPROVED" | "REJECTED") {
    if (selectedPhotoIds.size === 0) return;
    setBulkLoading(true);
    try {
      await fetch(`/api/media-events/${event.id}/photos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: Array.from(selectedPhotoIds), status }),
      });
      setSelectedPhotoIds(new Set());
      await refreshPhotos();
    } finally {
      setBulkLoading(false);
    }
  }

  async function deleteEvent() {
    if (!confirm(`Supprimer l'événement "${event.name}" et toutes ses photos ?`)) return;
    await fetch(`/api/media-events/${event.id}`, { method: "DELETE" });
    router.push("/media/events");
  }

  const pendingCount = event.photos.filter((p) => p.status === "PENDING").length;
  const approvedCount = event.photos.filter((p) => p.status === "APPROVED").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/media/events" className="text-sm text-gray-500 hover:text-gray-700">
              ← Événements
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{event.name}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-600">
            <span>{formatDate(event.date)}</span>
            <span className="text-gray-300">|</span>
            <span>{EVENT_STATUS_LABELS[event.status]}</span>
            <span className="text-gray-300">|</span>
            <span>{event._count.photos} photo{event._count.photos !== 1 ? "s" : ""}</span>
            {approvedCount > 0 && <span className="text-green-600">({approvedCount} approuvée{approvedCount > 1 ? "s" : ""})</span>}
            {pendingCount > 0 && <span className="text-yellow-600">({pendingCount} en attente)</span>}
          </div>
          {event.planningEvent && (
            <p className="text-xs text-icc-violet mt-1">Lié à : {event.planningEvent.title}</p>
          )}
          {event.description && <p className="text-sm text-gray-600 mt-2">{event.description}</p>}
        </div>
        {canManage && (
          <button
            onClick={deleteEvent}
            className="text-sm text-red-600 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors shrink-0"
          >
            Supprimer
          </button>
        )}
      </div>

      {/* Upload zone */}
      {canUpload && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Ajouter des photos</h2>
          <PhotoUploadZone eventId={event.id} onUploaded={refreshPhotos} />
        </section>
      )}

      {/* Photos */}
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-gray-900">
            Photos ({event._count.photos})
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={photoFilter}
              onChange={(e) => setPhotoFilter(e.target.value as MediaPhotoStatus | "")}
              className="border-2 border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
            >
              <option value="">Tous statuts</option>
              {(Object.keys(PHOTO_STATUS_LABELS) as MediaPhotoStatus[]).map((s) => (
                <option key={s} value={s}>{PHOTO_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Bulk actions */}
        {canReview && filteredPhotos.length > 0 && (
          <div className="flex items-center gap-3 mb-3 p-2 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              checked={selectedPhotoIds.size === filteredPhotos.length && filteredPhotos.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-gray-300"
            />
            <span className="text-sm text-gray-600">
              {selectedPhotoIds.size > 0 ? `${selectedPhotoIds.size} sélectionnée${selectedPhotoIds.size > 1 ? "s" : ""}` : "Tout sélectionner"}
            </span>
            {selectedPhotoIds.size > 0 && (
              <>
                <Button
                  size="sm"
                  onClick={() => bulkAction("APPROVED")}
                  disabled={bulkLoading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Approuver
                </Button>
                <Button
                  size="sm"
                  onClick={() => bulkAction("REJECTED")}
                  disabled={bulkLoading}
                  variant="danger"
                >
                  Rejeter
                </Button>
              </>
            )}
          </div>
        )}

        {filteredPhotos.length === 0 ? (
          <p className="text-gray-500 text-sm py-6 text-center">Aucune photo</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filteredPhotos.map((photo) => (
              <div
                key={photo.id}
                className={`relative group rounded-lg overflow-hidden border-2 transition-colors ${
                  selectedPhotoIds.has(photo.id) ? "border-icc-violet" : "border-gray-200"
                }`}
              >
                {canReview && (
                  <input
                    type="checkbox"
                    checked={selectedPhotoIds.has(photo.id)}
                    onChange={() => toggleSelect(photo.id)}
                    className="absolute top-2 left-2 z-10 w-4 h-4 rounded border-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={selectedPhotoIds.has(photo.id) ? { opacity: 1 } : {}}
                  />
                )}
                <div className="aspect-square bg-gray-100 overflow-hidden">
                  {thumbnailUrls[photo.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbnailUrls[photo.id]}
                      alt={photo.filename}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="p-1.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${PHOTO_STATUS_COLORS[photo.status]}`}>
                    {PHOTO_STATUS_LABELS[photo.status]}
                  </span>
                  <p className="text-xs text-gray-400 mt-1 truncate">{formatSize(photo.size)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Share tokens */}
      {canManage && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Liens de partage</h2>
          <ShareTokenSection
            eventId={event.id}
            tokens={event.shareTokens}
            onRefresh={refreshEvent}
          />
        </section>
      )}
    </div>
  );
}
