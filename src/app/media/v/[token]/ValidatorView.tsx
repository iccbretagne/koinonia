"use client";

import { useState, useEffect, useCallback } from "react";

type Photo = {
  id: string;
  filename: string;
  thumbnailUrl: string;
  status: string;
  size: number;
};

type ValidationData = {
  token: { id: string; type: string; label: string | null };
  event: {
    id: string;
    name: string;
    date: string;
    status: string;
    isPrevalidator: boolean;
    hasPrevalidator: boolean;
    photos: Photo[];
    totalPhotos: number;
    approvedCount: number;
    pendingCount: number;
    rejectedCount: number;
    prevalidatedCount: number;
    prerejectedCount: number;
  } | null;
  photos: Photo[];
};

const STATUS_BORDER: Record<string, string> = {
  PENDING:      "border-gray-300",
  APPROVED:     "border-green-500",
  REJECTED:     "border-red-400",
  PREVALIDATED: "border-blue-400",
  PREREJECTED:  "border-orange-400",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING:      "En attente",
  APPROVED:     "Approuvée",
  REJECTED:     "Rejetée",
  PREVALIDATED: "Pré-validée",
  PREREJECTED:  "Pré-rejetée",
};

const STATUS_BADGE: Record<string, string> = {
  PENDING:      "bg-gray-100 text-gray-600",
  APPROVED:     "bg-green-100 text-green-700",
  REJECTED:     "bg-red-100 text-red-700",
  PREVALIDATED: "bg-blue-100 text-blue-700",
  PREREJECTED:  "bg-orange-100 text-orange-700",
};

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });
}

// ── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({
  photo,
  token,
  isPrevalidator,
  onClose,
  onApprove,
  onReject,
  onPrev,
  onNext,
}: {
  photo: Photo;
  token: string;
  isPrevalidator: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [hdUrl, setHdUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const approveStatus = isPrevalidator ? "PREVALIDATED" : "APPROVED";
  const rejectStatus  = isPrevalidator ? "PREREJECTED"  : "REJECTED";
  const isPending = photo.status === "PENDING" || (isPrevalidator && photo.status === "PENDING");

  useEffect(() => {
    setHdUrl(null);
    setLoading(true);
    fetch(`/api/media/validate/${token}/photo/${photo.id}`)
      .then((r) => r.json())
      .then((j) => { if (j.data?.originalUrl) setHdUrl(j.data.originalUrl); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [photo.id, token]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft")  onPrev();
      if (e.key === "ArrowRight") onNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  async function handleAction(status: string) {
    setActionLoading(true);
    try {
      await fetch(`/api/media/validate/${token}/photo/${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (status === approveStatus) onApprove();
      else onReject();
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      {/* Nav prev */}
      <button
        className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/40 rounded-full p-3 z-10"
        onClick={(e) => { e.stopPropagation(); onPrev(); }}
        aria-label="Photo précédente"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Nav next */}
      <button
        className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/40 rounded-full p-3 z-10"
        onClick={(e) => { e.stopPropagation(); onNext(); }}
        aria-label="Photo suivante"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Close */}
      <button
        className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/40 rounded-full p-2 z-10"
        onClick={onClose}
        aria-label="Fermer"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Image */}
      <div
        className="relative max-w-5xl max-h-[85vh] mx-16 flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="w-64 h-64 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hdUrl ?? photo.thumbnailUrl}
            alt={photo.filename}
            className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
          />
        )}

        {/* Bottom bar */}
        <div className="mt-3 flex items-center gap-3 bg-black/60 rounded-xl px-4 py-2 text-white text-sm">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[photo.status] ?? "bg-gray-100 text-gray-700"}`}>
            {STATUS_LABELS[photo.status] ?? photo.status}
          </span>
          <span className="text-white/50 text-xs">{photo.filename}</span>
          <span className="text-white/50 text-xs">{formatSize(photo.size)}</span>
          {!loading && hdUrl && (
            <a
              href={hdUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/70 hover:text-white text-xs underline"
              onClick={(e) => e.stopPropagation()}
            >
              Ouvrir HD
            </a>
          )}
        </div>

        {/* Action buttons */}
        {isPending && (
          <div className="mt-2 flex gap-3">
            <button
              onClick={() => handleAction(approveStatus)}
              disabled={actionLoading}
              className="flex items-center gap-1.5 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Approuver
            </button>
            <button
              onClick={() => handleAction(rejectStatus)}
              disabled={actionLoading}
              className="flex items-center gap-1.5 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Rejeter
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ValidatorView({
  token,
  data,
}: {
  token: string;
  data: ValidationData;
}) {
  const { event } = data;
  const isPrevalidator = data.token.type === "PREVALIDATOR";
  const approveStatus = isPrevalidator ? "PREVALIDATED" : "APPROVED";
  const rejectStatus  = isPrevalidator ? "PREREJECTED"  : "REJECTED";

  const [photos, setPhotos] = useState<Photo[]>(data.photos ?? []);
  const [loading, setLoading]     = useState<Record<string, boolean>>({});
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const pendingPhotos = photos.filter((p) => p.status === "PENDING");

  async function setPhotoStatus(photoId: string, status: string) {
    setLoading((prev) => ({ ...prev, [photoId]: true }));
    try {
      const res = await fetch(`/api/media/validate/${token}/photo/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setPhotos((prev) => prev.map((p) => p.id === photoId ? { ...p, status } : p));
      }
    } finally {
      setLoading((prev) => ({ ...prev, [photoId]: false }));
    }
  }

  async function bulkSetStatus(status: string) {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      await Promise.all(
        Array.from(selected).map((id) =>
          fetch(`/api/media/validate/${token}/photo/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          })
        )
      );
      setPhotos((prev) => prev.map((p) => selected.has(p.id) ? { ...p, status } : p));
      setSelected(new Set());
    } finally {
      setBulkLoading(false);
    }
  }

  const openLightbox = useCallback((idx: number) => setLightboxIdx(idx), []);
  const closeLightbox = useCallback(() => setLightboxIdx(null), []);
  const prevPhoto = useCallback(() => setLightboxIdx((i) => i !== null ? Math.max(0, i - 1) : null), []);
  const nextPhoto = useCallback(() => setLightboxIdx((i) => i !== null ? Math.min(photos.length - 1, i + 1) : null), [photos.length]);

  const approvedCount = photos.filter((p) => ["APPROVED", "PREVALIDATED"].includes(p.status)).length;

  if (!event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-gray-600">Aucun événement associé à ce lien.</p>
      </div>
    );
  }

  return (
    <>
      {/* Lightbox */}
      {lightboxIdx !== null && (
        <Lightbox
          photo={photos[lightboxIdx]}
          token={token}
          isPrevalidator={isPrevalidator}
          onClose={closeLightbox}
          onApprove={() => {
            setPhotos((prev) => prev.map((p, i) => i === lightboxIdx ? { ...p, status: approveStatus } : p));
            if (lightboxIdx < photos.length - 1) setLightboxIdx(lightboxIdx + 1);
            else closeLightbox();
          }}
          onReject={() => {
            setPhotos((prev) => prev.map((p, i) => i === lightboxIdx ? { ...p, status: rejectStatus } : p));
            if (lightboxIdx < photos.length - 1) setLightboxIdx(lightboxIdx + 1);
            else closeLightbox();
          }}
          onPrev={prevPhoto}
          onNext={nextPhoto}
        />
      )}

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{event.name}</h1>
                <p className="text-sm text-gray-500 mt-0.5">{formatDate(event.date)}</p>
                {data.token.label && (
                  <span className="inline-block mt-1 text-xs bg-icc-violet/10 text-icc-violet px-2 py-0.5 rounded-full">
                    {data.token.label}
                  </span>
                )}
              </div>
              <div className="flex gap-2 text-sm shrink-0">
                <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">
                  {photos.length} photos
                </span>
                {pendingPhotos.length > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700 font-medium">
                    {pendingPhotos.length} en attente
                  </span>
                )}
                {approvedCount > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                    {approvedCount} approuvée{approvedCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
          {/* Bulk actions */}
          {pendingPhotos.length > 0 && (
            <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200 shadow-sm">
              <input
                type="checkbox"
                checked={selected.size === pendingPhotos.length && pendingPhotos.length > 0}
                onChange={() => {
                  if (selected.size === pendingPhotos.length) setSelected(new Set());
                  else setSelected(new Set(pendingPhotos.map((p) => p.id)));
                }}
                className="w-4 h-4 rounded border-gray-300 accent-icc-violet"
              />
              <span className="text-sm text-gray-600 flex-1">
                {selected.size > 0
                  ? `${selected.size} sélectionnée${selected.size > 1 ? "s" : ""}`
                  : "Tout sélectionner"}
              </span>
              {selected.size > 0 && (
                <>
                  <button
                    onClick={() => bulkSetStatus(approveStatus)}
                    disabled={bulkLoading}
                    className="flex items-center gap-1.5 text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    Approuver
                  </button>
                  <button
                    onClick={() => bulkSetStatus(rejectStatus)}
                    disabled={bulkLoading}
                    className="flex items-center gap-1.5 text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Rejeter
                  </button>
                </>
              )}
            </div>
          )}

          {/* Photo grid */}
          {photos.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Aucune photo à valider.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {photos.map((photo, idx) => {
                const isPending = photo.status === "PENDING";
                return (
                  <div
                    key={photo.id}
                    className={`relative group rounded-xl overflow-hidden border-2 bg-white shadow-sm transition-all hover:shadow-md ${STATUS_BORDER[photo.status] ?? "border-gray-300"}`}
                  >
                    {/* Checkbox overlay */}
                    {isPending && (
                      <input
                        type="checkbox"
                        checked={selected.has(photo.id)}
                        onChange={() => setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(photo.id)) next.delete(photo.id);
                          else next.add(photo.id);
                          return next;
                        })}
                        className="absolute top-2 left-2 z-10 w-4 h-4 rounded border-gray-300 accent-icc-violet opacity-0 group-hover:opacity-100 transition-opacity"
                        style={selected.has(photo.id) ? { opacity: 1 } : {}}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}

                    {/* Image — click opens lightbox */}
                    <div
                      className="aspect-square bg-gray-100 overflow-hidden cursor-pointer"
                      onClick={() => openLightbox(idx)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.thumbnailUrl}
                        alt={photo.filename}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      {/* Zoom hint */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <svg className="w-7 h-7 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                        </svg>
                      </div>
                    </div>

                    {/* Bottom: status + quick actions */}
                    <div className="p-1.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_BADGE[photo.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {STATUS_LABELS[photo.status] ?? photo.status}
                      </span>
                      {isPending && (
                        <div className="flex gap-1 mt-1">
                          <button
                            onClick={() => setPhotoStatus(photo.id, approveStatus)}
                            disabled={loading[photo.id]}
                            className="flex-1 text-xs bg-green-600 text-white py-1 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
                            title="Approuver"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => setPhotoStatus(photo.id, rejectStatus)}
                            disabled={loading[photo.id]}
                            className="flex-1 text-xs bg-red-600 text-white py-1 rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
                            title="Rejeter"
                          >
                            ✗
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
