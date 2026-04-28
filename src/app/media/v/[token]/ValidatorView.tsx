"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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
    totalPhotos: number;
    approvedCount: number;
    pendingCount: number;
    rejectedCount: number;
    prevalidatedCount: number;
    prerejectedCount: number;
  } | null;
  photos: Photo[];
};

const STATUS_BADGE: Record<string, string> = {
  PENDING:      "bg-gray-700 text-gray-200",
  APPROVED:     "bg-green-600 text-white",
  REJECTED:     "bg-red-600 text-white",
  PREVALIDATED: "bg-blue-600 text-white",
  PREREJECTED:  "bg-orange-600 text-white",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING:      "En attente",
  APPROVED:     "Validée",
  REJECTED:     "Rejetée",
  PREVALIDATED: "Pré-validée",
  PREREJECTED:  "Pré-rejetée",
};

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

type SummaryFilter = "ALL" | "APPROVED" | "REJECTED" | "PENDING";

// ── HD Lightbox ───────────────────────────────────────────────────────────────

function HdLightbox({
  photo,
  token,
  onClose,
  onApprove,
  onReject,
  approveStatus,
  rejectStatus,
  labels,
}: {
  photo: Photo;
  token: string;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  approveStatus: string;
  rejectStatus: string;
  labels: { approved: string; rejected: string };
}) {
  const [hdUrl, setHdUrl] = useState<string | null>(null);
  const [hdLoading, setHdLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const isPending = photo.status === "PENDING";

  useEffect(() => {
    setHdUrl(null);
    setHdLoading(true);
    fetch(`/api/media/validate/${token}/photo/${photo.id}`)
      .then((r) => r.json())
      .then((j) => { if (j.data?.originalUrl) setHdUrl(j.data.originalUrl); })
      .catch(() => {})
      .finally(() => setHdLoading(false));
  }, [photo.id, token]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col" onClick={onClose}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="text-white/70 hover:text-white transition-colors" aria-label="Fermer">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-white/60 text-xs truncate">{photo.filename}</span>
          <span className="text-white/40 text-xs shrink-0">{formatSize(photo.size)}</span>
        </div>
        {hdUrl && (
          <a
            href={hdUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-white/50 hover:text-white underline shrink-0 transition-colors"
          >
            Ouvrir ↗
          </a>
        )}
      </div>

      {/* Image */}
      <div
        className="flex-1 flex items-center justify-center px-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hdUrl ?? photo.thumbnailUrl}
            alt={photo.filename}
            className="max-w-full max-h-[78vh] object-contain rounded shadow-2xl"
            style={{ filter: hdLoading && !hdUrl ? "blur(3px)" : "none", transition: "filter 300ms" }}
          />
          {hdLoading && !hdUrl && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          )}
          {hdUrl && !hdLoading && (
            <div className="absolute top-2 right-2 text-[10px] text-white/40 bg-black/40 rounded px-1.5 py-0.5">HD</div>
          )}
          {/* Status badge */}
          {photo.status !== "PENDING" && (
            <div className="absolute top-2 left-2">
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_BADGE[photo.status] ?? "bg-gray-700 text-white"}`}>
                {STATUS_LABELS[photo.status] ?? photo.status}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom actions */}
      {isPending && (
        <div
          className="flex items-center justify-center gap-4 px-4 py-4 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => void handleAction(rejectStatus)}
            disabled={actionLoading}
            className="flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            ✗ {labels.rejected}
          </button>
          <button
            onClick={() => void handleAction(approveStatus)}
            disabled={actionLoading}
            className="flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            ✓ {labels.approved}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({
  total,
  approved,
  rejected,
}: {
  total: number;
  approved: number;
  rejected: number;
}) {
  if (total === 0) return null;
  const approvedPct = (approved / total) * 100;
  const rejectedPct = (rejected / total) * 100;
  const pendingPct  = 100 - approvedPct - rejectedPct;

  return (
    <div className="h-1 w-full flex shrink-0 overflow-hidden">
      <div className="bg-green-500 transition-all duration-300" style={{ width: `${approvedPct}%` }} />
      <div className="bg-red-500 transition-all duration-300"   style={{ width: `${rejectedPct}%` }} />
      <div className="bg-white/10"                              style={{ width: `${pendingPct}%` }} />
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ValidatorView({ token, data }: { token: string; data: ValidationData }) {
  const { event } = data;
  const isPrevalidator = data.token.type === "PREVALIDATOR";
  const approveStatus = isPrevalidator ? "PREVALIDATED" : "APPROVED";
  const rejectStatus  = isPrevalidator ? "PREREJECTED"  : "REJECTED";
  const labels = isPrevalidator
    ? { approved: "Gardée", rejected: "Écartée", approvedPlural: "gardées", rejectedPlural: "écartées" }
    : { approved: "Validée", rejected: "Rejetée", approvedPlural: "validées", rejectedPlural: "rejetées" };

  const [photos, setPhotos] = useState<Photo[]>(data.photos ?? []);
  const [currentIndex, setCurrentIndex] = useState(() => {
    const first = (data.photos ?? []).findIndex((p) => p.status === "PENDING");
    return first >= 0 ? first : 0;
  });
  const [showSummary, setShowSummary] = useState(false);
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>("ALL");
  const [undoAction, setUndoAction] = useState<{ photoId: string; prevStatus: string } | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [showHdLightbox, setShowHdLightbox] = useState(false);

  // Swipe gesture state
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPhotos = photos.length;
  const currentPhoto = photos[currentIndex];
  const approvedCount = photos.filter((p) => p.status === "APPROVED" || p.status === "PREVALIDATED").length;
  const rejectedCount = photos.filter((p) => p.status === "REJECTED"  || p.status === "PREREJECTED").length;
  const pendingCount  = photos.filter((p) => p.status === "PENDING").length;
  const allDecided = pendingCount === 0 && totalPhotos > 0;

  // Index of next PENDING photo after current position
  const nextPendingIndex = photos.findIndex((p, i) => i > currentIndex && p.status === "PENDING");
  // Also look before currentIndex if none found after
  const anyPendingIndex = nextPendingIndex >= 0
    ? nextPendingIndex
    : photos.findIndex((p) => p.status === "PENDING");

  const saveStatus = useCallback(async (photoId: string, status: string) => {
    setSaving((prev) => ({ ...prev, [photoId]: true }));
    try {
      await fetch(`/api/media/validate/${token}/photo/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } finally {
      setSaving((prev) => ({ ...prev, [photoId]: false }));
    }
  }, [token]);

  const makeDecision = useCallback(async (status: string) => {
    if (!currentPhoto) return;
    const prevStatus = currentPhoto.status;
    setPhotos((prev) => prev.map((p) => p.id === currentPhoto.id ? { ...p, status } : p));

    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoAction({ photoId: currentPhoto.id, prevStatus });
    undoTimerRef.current = setTimeout(() => setUndoAction(null), 3000);

    void saveStatus(currentPhoto.id, status);

    if (currentIndex < totalPhotos - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setShowSummary(true);
    }
  }, [currentPhoto, currentIndex, totalPhotos, saveStatus]);

  const skipPhoto = useCallback(() => {
    if (currentIndex < totalPhotos - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setShowSummary(true);
    }
  }, [currentIndex, totalPhotos]);

  const undo = useCallback(() => {
    if (!undoAction) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setPhotos((prev) =>
      prev.map((p) => p.id === undoAction.photoId ? { ...p, status: undoAction.prevStatus } : p)
    );
    void saveStatus(undoAction.photoId, undoAction.prevStatus);
    setCurrentIndex((i) => Math.max(0, i - 1));
    setUndoAction(null);
  }, [undoAction, saveStatus]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (showHdLightbox) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (showSummary) return;
      if (e.key === "ArrowRight" || e.key === "v") void makeDecision(approveStatus);
      else if (e.key === "ArrowLeft" || e.key === "x") void makeDecision(rejectStatus);
      else if (e.key === " " || e.key === "ArrowDown") { e.preventDefault(); skipPhoto(); }
      else if (e.key === "h" || e.key === "Enter") setShowHdLightbox(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [makeDecision, skipPhoto, showSummary, showHdLightbox, approveStatus, rejectStatus]);

  // Swipe gesture handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (showSummary || !currentPhoto || showHdLightbox) return;
      pointerIdRef.current = e.pointerId;
      startXRef.current = e.clientX;
      setDragging(true);
      setDragX(0);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [showSummary, currentPhoto, showHdLightbox]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging || pointerIdRef.current !== e.pointerId) return;
      setDragX(e.clientX - startXRef.current);
    },
    [dragging]
  );

  const handlePointerEnd = useCallback(() => {
    if (!dragging) return;
    const delta = dragX;
    setDragging(false);
    setDragX(0);
    pointerIdRef.current = null;
    if (Math.abs(delta) >= 80) void makeDecision(delta > 0 ? approveStatus : rejectStatus);
  }, [dragging, dragX, makeDecision, approveStatus, rejectStatus]);

  // Toggle decision in summary view
  const toggleDecision = useCallback(async (photoId: string) => {
    const photo = photos.find((p) => p.id === photoId);
    if (!photo) return;
    const newStatus =
      photo.status === approveStatus ? rejectStatus :
      photo.status === rejectStatus  ? "PENDING"    :
      photo.status === "PENDING"     ? approveStatus :
      photo.status;
    setPhotos((prev) => prev.map((p) => p.id === photoId ? { ...p, status: newStatus } : p));
    void saveStatus(photoId, newStatus);
  }, [photos, approveStatus, rejectStatus, saveStatus]);

  if (!event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-gray-600">Aucun événement associé à ce lien.</p>
      </div>
    );
  }

  if (totalPhotos === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-gray-500">Aucune photo à valider.</p>
      </div>
    );
  }

  // ── Summary view ─────────────────────────────────────────────────────────────
  if (showSummary) {
    const filteredPhotos = photos.filter((p) => {
      if (summaryFilter === "ALL") return true;
      if (summaryFilter === "APPROVED") return p.status === "APPROVED" || p.status === "PREVALIDATED";
      if (summaryFilter === "REJECTED") return p.status === "REJECTED"  || p.status === "PREREJECTED";
      return p.status === "PENDING";
    });

    const filterConfig: { key: SummaryFilter; label: string; count: number; active: string; dot: string }[] = [
      { key: "ALL",      label: "Toutes",                                 count: totalPhotos,   active: "bg-white/20 text-white",        dot: "" },
      { key: "APPROVED", label: isPrevalidator ? "Gardées" : "Validées",  count: approvedCount, active: "bg-green-500/30 text-green-300", dot: "bg-green-400" },
      { key: "REJECTED", label: isPrevalidator ? "Écartées" : "Rejetées", count: rejectedCount, active: "bg-red-500/30 text-red-300",     dot: "bg-red-400" },
      { key: "PENDING",  label: "En attente",                             count: pendingCount,  active: "bg-yellow-500/20 text-yellow-300", dot: "bg-yellow-400" },
    ];

    return (
      <div className="min-h-screen bg-black flex flex-col">
        {/* Progress bar */}
        <ProgressBar total={totalPhotos} approved={approvedCount} rejected={rejectedCount} />

        {/* Header */}
        <header className="bg-black/90 px-4 pt-4 pb-3 sticky top-0 z-10">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => {
                const firstPending = photos.findIndex((p) => p.status === "PENDING");
                setCurrentIndex(firstPending >= 0 ? firstPending : 0);
                setShowSummary(false);
                setSummaryFilter("ALL");
              }}
              className="text-white/70 hover:text-white text-sm transition-colors"
            >
              ← {pendingCount > 0 ? `${pendingCount} en attente` : "Retour"}
            </button>
            <span className="text-white/80 text-sm font-medium truncate max-w-[45%]">{event.name}</span>
            <span className="text-white/50 text-sm tabular-nums shrink-0">{totalPhotos} photos</span>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-green-500/15 border border-green-500/30 rounded-xl px-3 py-2.5 text-center">
              <p className="text-2xl font-bold text-green-400 tabular-nums">{approvedCount}</p>
              <p className="text-xs text-green-400/70 mt-0.5">{labels.approvedPlural}</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-center">
              <p className="text-2xl font-bold text-white/50 tabular-nums">{pendingCount}</p>
              <p className="text-xs text-white/30 mt-0.5">en attente</p>
            </div>
            <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-3 py-2.5 text-center">
              <p className="text-2xl font-bold text-red-400 tabular-nums">{rejectedCount}</p>
              <p className="text-xs text-red-400/70 mt-0.5">{labels.rejectedPlural}</p>
            </div>
          </div>

          {/* Filter pills */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {filterConfig.map(({ key, label, count, active, dot }) => (
              <button
                key={key}
                onClick={() => setSummaryFilter(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 border transition-colors ${
                  summaryFilter === key
                    ? `${active} border-transparent`
                    : "bg-transparent text-white/40 border-white/10 hover:border-white/20 hover:text-white/60"
                }`}
              >
                {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />}
                {label}
                <span className="tabular-nums opacity-70">({count})</span>
              </button>
            ))}
          </div>
        </header>

        {/* Grid */}
        <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-7 gap-1 p-2 flex-1">
          {filteredPhotos.map((photo) => {
            const isApproved = photo.status === "APPROVED" || photo.status === "PREVALIDATED";
            const isRejected = photo.status === "REJECTED"  || photo.status === "PREREJECTED";
            return (
              <button
                key={photo.id}
                onClick={() => void toggleDecision(photo.id)}
                className="relative aspect-square bg-gray-900 overflow-hidden rounded-sm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.thumbnailUrl}
                  alt={photo.filename}
                  className="w-full h-full object-cover"
                />
                {/* Corner badge */}
                {isApproved && (
                  <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shadow-md">
                    <span className="text-white text-[10px] font-bold leading-none">✓</span>
                  </div>
                )}
                {isRejected && (
                  <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center shadow-md">
                    <span className="text-white text-[10px] font-bold leading-none">✗</span>
                  </div>
                )}
                {photo.status === "PENDING" && (
                  <div className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-yellow-400 shadow-md" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Card-swipe view ───────────────────────────────────────────────────────────
  return (
    <>
      {/* HD Lightbox */}
      {showHdLightbox && currentPhoto && (
        <HdLightbox
          photo={currentPhoto}
          token={token}
          approveStatus={approveStatus}
          rejectStatus={rejectStatus}
          labels={labels}
          onClose={() => setShowHdLightbox(false)}
          onApprove={() => {
            setPhotos((prev) => prev.map((p) => p.id === currentPhoto.id ? { ...p, status: approveStatus } : p));
            setShowHdLightbox(false);
            if (currentIndex < totalPhotos - 1) setCurrentIndex((i) => i + 1);
            else setShowSummary(true);
          }}
          onReject={() => {
            setPhotos((prev) => prev.map((p) => p.id === currentPhoto.id ? { ...p, status: rejectStatus } : p));
            setShowHdLightbox(false);
            if (currentIndex < totalPhotos - 1) setCurrentIndex((i) => i + 1);
            else setShowSummary(true);
          }}
        />
      )}

      <div className="min-h-screen bg-black flex flex-col select-none overflow-hidden">
        {/* Progress bar */}
        <ProgressBar total={totalPhotos} approved={approvedCount} rejected={rejectedCount} />

        {/* Header */}
        <header className="bg-black/80 text-white px-4 py-3 flex items-center justify-between shrink-0">
          <div className="text-sm truncate max-w-[35%] text-white/80">{event.name}</div>

          <div className="flex items-center gap-2">
            {/* Jump to next pending */}
            {!allDecided && currentPhoto?.status !== "PENDING" && anyPendingIndex >= 0 && (
              <button
                onClick={() => setCurrentIndex(anyPendingIndex)}
                className="text-xs text-yellow-400 hover:text-yellow-300 bg-yellow-900/40 border border-yellow-700/50 rounded-full px-2.5 py-0.5 transition-colors"
              >
                {pendingCount} en attente →
              </button>
            )}
            <button
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
              className="text-white disabled:opacity-30 text-xl px-1"
              aria-label="Photo précédente"
            >
              ‹
            </button>
            <span className="text-sm tabular-nums text-white/90">{currentIndex + 1}/{totalPhotos}</span>
            <button
              onClick={() => setCurrentIndex((i) => Math.min(totalPhotos - 1, i + 1))}
              disabled={currentIndex === totalPhotos - 1}
              className="text-white disabled:opacity-30 text-xl px-1"
              aria-label="Photo suivante"
            >
              ›
            </button>
          </div>

          <button onClick={() => setShowSummary(true)} className="text-sm text-white/70 hover:text-white">
            Récap
          </button>
        </header>

        {/* Photo area */}
        <div
          className="flex-1 flex items-center justify-center relative overflow-hidden"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          style={{ touchAction: "pan-y" }}
        >
          {currentPhoto && (
            <div
              className="relative flex items-center justify-center"
              style={{
                transform: `translateX(${dragX}px) rotate(${dragX / 20}deg)`,
                transition: dragging ? "none" : "transform 150ms ease-out",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentPhoto.thumbnailUrl}
                alt={currentPhoto.filename}
                className="max-w-[90vw] max-h-[65vh] object-contain"
                draggable={false}
              />

              {/* Swipe feedback */}
              {dragX !== 0 && (
                <div
                  className={`absolute inset-0 flex items-start ${dragX > 0 ? "justify-start" : "justify-end"}`}
                  style={{ opacity: Math.min(Math.abs(dragX) / 100, 1) }}
                >
                  <div
                    className={`m-4 w-14 h-14 rounded-full flex items-center justify-center text-2xl text-white ${
                      dragX > 0 ? "bg-green-500" : "bg-red-500"
                    }`}
                  >
                    {dragX > 0 ? "✓" : "✗"}
                  </div>
                </div>
              )}

              {/* Decision badge */}
              {dragX === 0 && currentPhoto.status !== "PENDING" && (
                <div className="absolute top-3 left-3">
                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[currentPhoto.status] ?? "bg-gray-700 text-white"}`}>
                    {STATUS_LABELS[currentPhoto.status] ?? currentPhoto.status}
                  </span>
                </div>
              )}

              {/* HD button — tap opens lightbox */}
              <button
                onClick={() => setShowHdLightbox(true)}
                className="absolute bottom-3 right-3 text-xs text-white/60 hover:text-white bg-black/50 hover:bg-black/70 rounded-lg px-2.5 py-1.5 transition-colors flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
                HD
              </button>
            </div>
          )}
        </div>

        {/* Stats bar */}
        <div className="bg-black/60 px-4 py-1.5 flex items-center justify-center gap-4 shrink-0">
          <span className="text-xs text-green-400 tabular-nums">{approvedCount} {labels.approvedPlural}</span>
          <span className="text-xs text-white/30" aria-hidden>·</span>
          <span className="text-xs text-white/40 tabular-nums">{pendingCount} en attente</span>
          <span className="text-xs text-white/30" aria-hidden>·</span>
          <span className="text-xs text-red-400 tabular-nums">{rejectedCount} {labels.rejectedPlural}</span>
        </div>

        {/* "All decided" banner */}
        {allDecided && (
          <div className="bg-green-700 text-white text-sm px-4 py-2 text-center shrink-0">
            Tout est traité.{" "}
            <button onClick={() => setShowSummary(true)} className="font-bold underline">
              Voir le récap
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div
          className="bg-black/80 px-4 pt-4 flex items-center justify-center gap-5 shrink-0"
          style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        >
          <button
            onClick={() => void makeDecision(rejectStatus)}
            disabled={!!saving[currentPhoto?.id ?? ""]}
            className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center text-2xl hover:bg-red-600 active:scale-95 transition-all disabled:opacity-50 shadow-lg"
            aria-label="Rejeter"
          >
            ✗
          </button>
          <button
            onClick={skipPhoto}
            className="w-12 h-12 rounded-full bg-gray-600 text-white flex items-center justify-center text-xs hover:bg-gray-500 active:scale-95 transition-all"
            aria-label="Passer"
          >
            Passer
          </button>
          <button
            onClick={() => void makeDecision(approveStatus)}
            disabled={!!saving[currentPhoto?.id ?? ""]}
            className="w-16 h-16 rounded-full bg-green-500 text-white flex items-center justify-center text-2xl hover:bg-green-600 active:scale-95 transition-all disabled:opacity-50 shadow-lg"
            aria-label="Valider"
          >
            ✓
          </button>
        </div>

        {/* Keyboard hints */}
        <div className="bg-black/60 px-4 py-1 flex justify-center gap-4 shrink-0">
          <span className="text-[10px] text-white/30">← X : rejeter</span>
          <span className="text-[10px] text-white/30">Espace : passer</span>
          <span className="text-[10px] text-white/30">→ V : valider</span>
          <span className="text-[10px] text-white/30">H / Entrée : HD</span>
        </div>

        {/* Undo toast */}
        {undoAction && (
          <div
            className="fixed left-4 right-4 bg-gray-800 text-white rounded-xl px-4 py-3 flex items-center justify-between z-50 shadow-xl"
            style={{ bottom: "calc(7rem + env(safe-area-inset-bottom))" }}
          >
            <span className="text-sm">
              {(() => {
                const photo = photos.find((p) => p.id === undoAction.photoId);
                const s = photo?.status;
                if (s === "APPROVED" || s === "PREVALIDATED") return labels.approved;
                if (s === "REJECTED" || s === "PREREJECTED") return labels.rejected;
                return "Annulé";
              })()}
            </span>
            <button onClick={undo} className="text-icc-violet font-bold text-sm ml-4">
              ANNULER
            </button>
          </div>
        )}
      </div>
    </>
  );
}
