"use client";

import { Check, ChevronLeft, ChevronRight, Download, X, ZoomIn } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import DownloadAllButton from "../../_components/DownloadAllButton";
import { Button, Checkbox, StatusChip } from "@/components/ui";
import IconButton from "@/components/ui/IconButton";

type Photo = {
  id: string;
  filename: string;
  thumbnailUrl: string;
  size: number;
  width: number | null;
  height: number | null;
  status: string;
};

type DownloadData = {
  token: { id: string; type: string; label: string | null };
  event: { id: string; name: string; date: string; photoCount: number } | null;
  photos: Photo[];
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function selectionLabel(count: number, size: number): string {
  if (count === 0) return "Tout sélectionner";
  const plural = count > 1 ? "s" : "";
  return `${count} sélectionnée${plural} (${formatSize(size)})`;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({
  photo,
  token,
  total,
  index,
  isSelected,
  onClose,
  onPrev,
  onNext,
  onToggleSelect,
  onDownload,
  downloading,
  isMediaAll,
}: {
  readonly photo: Photo;
  readonly token: string;
  readonly total: number;
  readonly index: number;
  readonly isSelected: boolean;
  readonly onClose: () => void;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onToggleSelect: () => void;
  readonly onDownload: () => void;
  readonly downloading: boolean;
  readonly isMediaAll: boolean;
}) {
  const [currentPhotoId, setCurrentPhotoId] = useState(photo.id);
  const [hdUrl, setHdUrl] = useState<string | null>(null);
  const [hdLoading, setHdLoading] = useState(true);

  // Reset state synchronously during render when photo changes (recommended pattern over useEffect reset)
  if (currentPhotoId !== photo.id) {
    setCurrentPhotoId(photo.id);
    setHdUrl(null);
    setHdLoading(true);
  }

  useEffect(() => {
    let mounted = true;
    fetch(`/api/media/download/${token}/photo/${photo.id}`)
      .then((r) => r.json())
      .then((j) => { if (mounted && j.downloadUrl) setHdUrl(j.downloadUrl); })
      .catch(() => {})
      .finally(() => { if (mounted) setHdLoading(false); });
    return () => { mounted = false; };
  }, [photo.id, token]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  return (
    <div className="fixed inset-0 z-50 bg-scrim/95 flex flex-col" role="none" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
      >
        <div className="flex items-center gap-3 min-w-0">
          <IconButton variant="on-dark" icon={X} onClick={onClose} aria-label="Fermer la visionneuse" className="shrink-0" />
          <span className="text-on-brand/80 text-sm truncate">{photo.filename}</span>
          {isMediaAll && photo.status !== "APPROVED" && (
            <StatusChip tone="warning" className="shrink-0">Non validée</StatusChip>
          )}
        </div>
        <span className="text-on-brand/50 text-sm tabular-nums shrink-0">{index + 1}/{total}</span>
      </div>

      {/* Image */}
      <div
        className="flex-1 flex items-center justify-center relative px-14 overflow-hidden"
      >
        {/* Prev */}
        <IconButton variant="on-dark" icon={ChevronLeft} onClick={onPrev} disabled={index === 0} aria-label="Photo précédente" className="absolute left-3 top-1/2 -translate-y-1/2 bg-scrim rounded-full z-10" />

        {/* Next */}
        <IconButton variant="on-dark" icon={ChevronRight} onClick={onNext} disabled={index === total - 1} aria-label="Photo suivante" className="absolute right-3 top-1/2 -translate-y-1/2 bg-scrim rounded-full z-10" />

        <div className="relative flex items-center justify-center max-w-full max-h-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hdUrl ?? photo.thumbnailUrl}
            alt={photo.filename}
            className="max-w-full max-h-[75vh] object-contain rounded-control shadow-overlay"
            style={{ filter: hdLoading && !hdUrl ? "blur(2px)" : "none", transition: "filter 200ms" }}
          />
          {hdLoading && !hdUrl && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-on-brand/20 border-t-on-brand rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="flex items-center justify-between px-4 py-3 gap-3 shrink-0"
      >
        <div className="flex items-center gap-2 text-on-brand/50 text-sm min-w-0">
          <span className="shrink-0">{formatSize(photo.size)}</span>
          {photo.width && photo.height && (
            <span className="shrink-0">{photo.width}×{photo.height}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Select toggle */}
          <button
            onClick={onToggleSelect}
            aria-pressed={isSelected}
            className={`flex min-h-11 items-center gap-1.5 font-display text-sm px-4 rounded-control border transition-colors font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
              isSelected
                ? "bg-brand text-on-brand border-brand"
                : "bg-on-brand/10 text-on-brand/80 border-on-brand/20 hover:bg-on-brand/20"
            }`}
          >
            {isSelected ? (
              <>
                <Check className="w-4 h-4" aria-hidden="true" />
                Sélectionnée
              </>
            ) : "Sélectionner la photo"}
          </button>

          {/* Download */}
          <Button type="button" onClick={onDownload} disabled={downloading}>
            {downloading ? (
              <span className="w-4 h-4 border-2 border-on-brand/30 border-t-on-brand rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" aria-hidden="true" />
            )}
            {downloading ? "Téléchargement en cours…" : "Télécharger la photo"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DownloadView({ token, data }: { readonly token: string; readonly data: DownloadData }) {
  const { event, photos } = data;
  const isMediaAll = data.token.type === "MEDIA_ALL";

  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zipping, setZipping] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  async function downloadZip(photoIds?: string[]) {
    setZipping(true);
    try {
      const res = await fetch(`/api/media/download/${token}/zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(photoIds?.length ? { photoIds } : {}),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "photos.zip";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }

  async function downloadPhoto(photoId: string, filename: string) {
    setDownloading((prev) => ({ ...prev, [photoId]: true }));
    try {
      const res = await fetch(`/api/media/download/${token}/photo/${photoId}`);
      const json = await res.json();
      if (!res.ok) return;
      const a = document.createElement("a");
      a.href = json.downloadUrl;
      a.download = filename;
      a.click();
    } finally {
      setDownloading((prev) => ({ ...prev, [photoId]: false }));
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const closeLightbox = useCallback(() => setLightboxIdx(null), []);
  const prevPhoto = useCallback(() => setLightboxIdx((i) => i !== null ? Math.max(0, i - 1) : null), []);
  const nextPhoto = useCallback(() => setLightboxIdx((i) => i !== null ? Math.min(photos.length - 1, i + 1) : null), [photos.length]);

  const totalSize = photos.reduce((acc, p) => acc + p.size, 0);
  const selectedSize = photos.filter((p) => selected.has(p.id)).reduce((acc, p) => acc + p.size, 0);

  return (
    <>
      {lightboxIdx !== null && (
        <Lightbox
          photo={photos[lightboxIdx]}
          token={token}
          total={photos.length}
          index={lightboxIdx}
          isSelected={selected.has(photos[lightboxIdx].id)}
          isMediaAll={isMediaAll}
          onClose={closeLightbox}
          onPrev={prevPhoto}
          onNext={nextPhoto}
          onToggleSelect={() => toggleSelect(photos[lightboxIdx].id)}
          onDownload={() => downloadPhoto(photos[lightboxIdx].id, photos[lightboxIdx].filename)}
          downloading={!!downloading[photos[lightboxIdx].id]}
        />
      )}

      <div className="min-h-screen bg-bg">
        <header className="bg-surface border-b border-line px-4 py-5">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-xl font-bold text-ink">{event?.name ?? "Téléchargement"}</h1>
            {event && <p className="text-sm text-ink-muted mt-1">{formatDate(event.date)}</p>}
            {data.token.label && <p className="text-xs text-ink-subtle mt-0.5">{data.token.label}</p>}
            <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
              <p className="text-sm text-ink-muted">
                {photos.length} photo{photos.length > 1 ? "s" : ""}
                {isMediaAll && photos.some((p) => p.status !== "APPROVED") && (
                  <StatusChip tone="warning" className="ml-1.5">
                    dont {photos.filter((p) => p.status !== "APPROVED").length} non validée{photos.filter((p) => p.status !== "APPROVED").length > 1 ? "s" : ""}
                  </StatusChip>
                )}
                {" · "}{formatSize(totalSize)}
              </p>
              {photos.length > 0 && (
                <DownloadAllButton onClick={() => downloadZip()} zipping={zipping} />
              )}
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto p-4 space-y-4">
          {/* Select all / bulk actions */}
          {photos.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 p-3 bg-surface rounded-card border border-line shadow-card">
              <label className="flex min-h-11 flex-1 items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={selected.size === photos.length && photos.length > 0}
                  onChange={() => {
                    if (selected.size === photos.length) setSelected(new Set());
                    else setSelected(new Set(photos.map((p) => p.id)));
                  }}
                />
                <span className="text-sm text-ink-muted">
                  {selectionLabel(selected.size, selectedSize)}
                </span>
              </label>
              {selected.size > 0 && (
                <Button type="button" variant="secondary" onClick={() => downloadZip(Array.from(selected))} disabled={zipping}>
                  {zipping ? "Préparation en cours…" : `Télécharger la sélection (${selected.size})`}
                </Button>
              )}
            </div>
          )}

          {photos.length === 0 ? (
            <p className="text-center text-ink-muted py-16">Aucune photo disponible.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {photos.map((photo, idx) => (
                <div
                  key={photo.id}
                  className={`group rounded-control overflow-hidden border-2 bg-surface transition-colors ${
                    selected.has(photo.id) ? "border-brand" : "border-line"
                  }`}
                >
                  {/* Thumbnail — click opens lightbox */}
                  <div
                    className="aspect-square bg-surface-sunken relative cursor-pointer overflow-hidden focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                    role="button"
                    aria-label={`Agrandir ${photo.filename}`}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        setLightboxIdx(idx);
                      }
                    }}
                    onClick={() => setLightboxIdx(idx)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.thumbnailUrl}
                      alt={photo.filename}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                    {/* Zoom hint overlay */}
                    <div className="absolute inset-0 bg-scrim/0 group-hover:bg-scrim/25 transition-colors flex items-center justify-center">
                      <ZoomIn className="w-7 h-7 text-on-brand opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" aria-hidden="true" />
                    </div>
                    {/* Checkbox overlay */}
                    <Checkbox
                      aria-label={`Sélectionner ${photo.filename}`}
                      checked={selected.has(photo.id)}
                      onChange={() => toggleSelect(photo.id)}
                      onClick={(e) => e.stopPropagation()}
                      className={`absolute top-2 left-2 z-10 transition-opacity focus-visible:opacity-100 ${selected.has(photo.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                    />
                  </div>

                  <div className="p-1.5">
                    {isMediaAll && photo.status !== "APPROVED" && (
                      <StatusChip tone="warning" className="mb-0.5">Non validée</StatusChip>
                    )}
                    <p className="text-xs text-ink-muted truncate">{photo.filename}</p>
                    <p className="text-xs text-ink-subtle">{formatSize(photo.size)}</p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-1 w-full"
                      onClick={() => downloadPhoto(photo.id, photo.filename)}
                      disabled={downloading[photo.id]}
                    >
                      {downloading[photo.id] ? "Téléchargement en cours…" : "Télécharger"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
