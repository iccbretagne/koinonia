"use client";

import { useState, useEffect, useCallback } from "react";

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
  photo: Photo;
  token: string;
  total: number;
  index: number;
  isSelected: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleSelect: () => void;
  onDownload: () => void;
  downloading: boolean;
  isMediaAll: boolean;
}) {
  const [hdUrl, setHdUrl] = useState<string | null>(null);
  const [hdLoading, setHdLoading] = useState(true);

  useEffect(() => {
    setHdUrl(null);
    setHdLoading(true);
    fetch(`/api/media/download/${token}/photo/${photo.id}`)
      .then((r) => r.json())
      .then((j) => { if (j.downloadUrl) setHdUrl(j.downloadUrl); })
      .catch(() => {})
      .finally(() => setHdLoading(false));
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
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col" onClick={onClose}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors shrink-0"
            aria-label="Fermer"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <span className="text-white/80 text-sm truncate">{photo.filename}</span>
          {isMediaAll && photo.status !== "APPROVED" && (
            <span className="shrink-0 text-xs text-yellow-300 bg-yellow-900/60 border border-yellow-700/50 rounded-full px-2 py-0.5">
              Non validée
            </span>
          )}
        </div>
        <span className="text-white/50 text-sm tabular-nums shrink-0">{index + 1}/{total}</span>
      </div>

      {/* Image */}
      <div
        className="flex-1 flex items-center justify-center relative px-14 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Prev */}
        <button
          onClick={onPrev}
          disabled={index === 0}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-2.5 transition-all disabled:opacity-20 z-10"
          aria-label="Photo précédente"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Next */}
        <button
          onClick={onNext}
          disabled={index === total - 1}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-2.5 transition-all disabled:opacity-20 z-10"
          aria-label="Photo suivante"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div className="relative flex items-center justify-center max-w-full max-h-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hdUrl ?? photo.thumbnailUrl}
            alt={photo.filename}
            className="max-w-full max-h-[75vh] object-contain rounded shadow-2xl"
            style={{ filter: hdLoading && !hdUrl ? "blur(2px)" : "none", transition: "filter 200ms" }}
          />
          {hdLoading && !hdUrl && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="flex items-center justify-between px-4 py-3 gap-3 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-white/50 text-sm min-w-0">
          <span className="shrink-0">{formatSize(photo.size)}</span>
          {photo.width && photo.height && (
            <span className="shrink-0">{photo.width}×{photo.height}</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Select toggle */}
          <button
            onClick={onToggleSelect}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors font-medium ${
              isSelected
                ? "bg-icc-violet text-white border-icc-violet"
                : "bg-white/10 text-white/80 border-white/20 hover:bg-white/20"
            }`}
          >
            {isSelected ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Sélectionnée
              </>
            ) : "Sélectionner"}
          </button>

          {/* Download */}
          <button
            onClick={onDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 text-sm bg-icc-violet text-white px-3 py-1.5 rounded-lg hover:bg-icc-violet/90 disabled:opacity-50 transition-colors font-medium"
          >
            {downloading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            Télécharger
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DownloadView({ token, data }: { token: string; data: DownloadData }) {
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

      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-4 py-5">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-xl font-bold text-gray-900">{event?.name ?? "Téléchargement"}</h1>
            {event && <p className="text-sm text-gray-500 mt-1">{formatDate(event.date)}</p>}
            {data.token.label && <p className="text-xs text-gray-400 mt-0.5">{data.token.label}</p>}
            <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
              <p className="text-sm text-gray-600">
                {photos.length} photo{photos.length !== 1 ? "s" : ""}
                {isMediaAll && photos.some((p) => p.status !== "APPROVED") && (
                  <span className="ml-1.5 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-full px-2 py-0.5">
                    dont {photos.filter((p) => p.status !== "APPROVED").length} non validée{photos.filter((p) => p.status !== "APPROVED").length > 1 ? "s" : ""}
                  </span>
                )}
                {" · "}{formatSize(totalSize)}
              </p>
              {photos.length > 0 && (
                <button
                  onClick={() => downloadZip()}
                  disabled={zipping}
                  className="flex items-center gap-1.5 text-sm bg-icc-violet text-white px-4 py-2 rounded-lg hover:bg-icc-violet/90 disabled:opacity-50 transition-colors font-medium"
                >
                  {zipping ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Préparation…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Tout télécharger (.zip)
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto p-4 space-y-4">
          {/* Select all / bulk actions */}
          {photos.length > 0 && (
            <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
              <input
                type="checkbox"
                checked={selected.size === photos.length && photos.length > 0}
                onChange={() => {
                  if (selected.size === photos.length) setSelected(new Set());
                  else setSelected(new Set(photos.map((p) => p.id)));
                }}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm text-gray-600 flex-1">
                {selected.size > 0
                  ? `${selected.size} sélectionnée${selected.size > 1 ? "s" : ""} (${formatSize(selectedSize)})`
                  : "Tout sélectionner"}
              </span>
              {selected.size > 0 && (
                <button
                  onClick={() => downloadZip(Array.from(selected))}
                  disabled={zipping}
                  className="flex items-center gap-1.5 text-sm bg-icc-violet text-white px-3 py-1.5 rounded-lg hover:bg-icc-violet/90 disabled:opacity-50 transition-colors font-medium"
                >
                  {zipping ? "Préparation…" : `Télécharger (${selected.size})`}
                </button>
              )}
            </div>
          )}

          {photos.length === 0 ? (
            <p className="text-center text-gray-500 py-16">Aucune photo disponible.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {photos.map((photo, idx) => (
                <div
                  key={photo.id}
                  className={`group rounded-lg overflow-hidden border-2 bg-white transition-colors ${
                    selected.has(photo.id) ? "border-icc-violet" : "border-gray-200"
                  }`}
                >
                  {/* Thumbnail — click opens lightbox */}
                  <div
                    className="aspect-square bg-gray-100 relative cursor-pointer overflow-hidden"
                    onClick={() => setLightboxIdx(idx)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.thumbnailUrl}
                      alt={photo.filename}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                    {/* Zoom hint overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                      <svg className="w-7 h-7 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                      </svg>
                    </div>
                    {/* Checkbox overlay */}
                    <input
                      type="checkbox"
                      checked={selected.has(photo.id)}
                      onChange={() => toggleSelect(photo.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-2 left-2 w-4 h-4 rounded border-gray-300 accent-icc-violet opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      style={selected.has(photo.id) ? { opacity: 1 } : {}}
                    />
                  </div>

                  <div className="p-1.5">
                    {isMediaAll && photo.status !== "APPROVED" && (
                      <span className="inline-block text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-full px-1.5 py-0.5 mb-0.5">
                        Non validée
                      </span>
                    )}
                    <p className="text-xs text-gray-500 truncate">{photo.filename}</p>
                    <p className="text-xs text-gray-400">{formatSize(photo.size)}</p>
                    <button
                      onClick={() => downloadPhoto(photo.id, photo.filename)}
                      disabled={downloading[photo.id]}
                      className="mt-1 w-full text-xs bg-icc-violet text-white py-1 rounded hover:bg-icc-violet/90 disabled:opacity-50 transition-colors"
                    >
                      {downloading[photo.id] ? "…" : "Télécharger"}
                    </button>
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
