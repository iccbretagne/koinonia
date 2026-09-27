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
  PENDING:      "bg-control-line text-ink-subtle",
  APPROVED:     "bg-success text-surface",
  REJECTED:     "bg-danger text-on-danger",
  PREVALIDATED: "bg-info text-surface",
  PREREJECTED:  "bg-warning text-surface",
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
  readonly photo: Photo;
  readonly token: string;
  readonly onClose: () => void;
  readonly onApprove: () => void;
  readonly onReject: () => void;
  readonly approveStatus: string;
  readonly rejectStatus: string;
  readonly labels: { approved: string; rejected: string };
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
    <div className="fixed inset-0 z-50 bg-scrim/95 flex flex-col" onClick={onClose}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="text-on-brand/70 hover:text-on-brand transition-colors" aria-label="Fermer">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-on-brand/60 text-xs truncate">{photo.filename}</span>
          <span className="text-on-brand/40 text-xs shrink-0">{formatSize(photo.size)}</span>
        </div>
        {hdUrl && (
          <a
            href={hdUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-on-brand/50 hover:text-on-brand underline shrink-0 transition-colors"
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
            className="max-w-full max-h-[78vh] object-contain rounded shadow-overlay"
            style={{ filter: hdLoading && !hdUrl ? "blur(3px)" : "none", transition: "filter 300ms" }}
          />
          {hdLoading && !hdUrl && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-on-brand/20 border-t-on-brand rounded-full animate-spin" />
            </div>
          )}
          {hdUrl && !hdLoading && (
            <div className="absolute top-2 right-2 text-[10px] text-on-brand/40 bg-scrim rounded px-1.5 py-0.5">HD</div>
          )}
          {/* Status badge */}
          {photo.status !== "PENDING" && (
            <div className="absolute top-2 left-2">
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_BADGE[photo.status] ?? "bg-surface-sunken text-ink-subtle"}`}>
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
            className="flex items-center gap-2 bg-danger text-on-danger px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-danger/90 disabled:opacity-50 transition-colors"
          >
            ✗ {labels.rejected}
          </button>
          <button
            onClick={() => void handleAction(approveStatus)}
            disabled={actionLoading}
            className="flex items-center gap-2 bg-success text-surface px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-success/90 disabled:opacity-50 transition-colors"
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
  readonly total: number;
  readonly approved: number;
  readonly rejected: number;
}) {
  if (total === 0) return null;
  const approvedPct = (approved / total) * 100;
  const rejectedPct = (rejected / total) * 100;
  const pendingPct  = 100 - approvedPct - rejectedPct;

  return (
    <div className="h-1 w-full flex shrink-0 overflow-hidden">
      <div className="bg-success transition-all duration-300" style={{ width: `${approvedPct}%` }} />
      <div className="bg-danger transition-all duration-300"   style={{ width: `${rejectedPct}%` }} />
      <div className="bg-ink/10"                              style={{ width: `${pendingPct}%` }} />
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ValidatorView({ token, data }: { readonly token: string; readonly data: ValidationData }) {
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
  const [summaryDark, setSummaryDark] = useState(true);

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
      <div className="min-h-screen bg-surface-sunken flex items-center justify-center p-4">
        <p className="text-ink-muted">Aucun événement associé à ce lien.</p>
      </div>
    );
  }

  if (totalPhotos === 0) {
    return (
      <div className="min-h-screen bg-surface-sunken flex items-center justify-center p-4">
        <p className="text-ink-muted">Aucune photo à valider.</p>
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

    const dk = summaryDark;

    const filterConfig: { key: SummaryFilter; label: string; count: number; activeClass: string; dot: string }[] = [
      { key: "ALL",      label: "Toutes",                                 count: totalPhotos,   activeClass: dk ? "bg-ink/20 text-ink border-transparent"           : "bg-surface-sunken text-ink border-transparent",        dot: "" },
      { key: "APPROVED", label: isPrevalidator ? "Gardées" : "Validées",  count: approvedCount, activeClass: dk ? "bg-success/30 text-success border-transparent"   : "bg-success-soft text-success border-transparent", dot: "bg-success" },
      { key: "REJECTED", label: isPrevalidator ? "Écartées" : "Rejetées", count: rejectedCount, activeClass: dk ? "bg-danger/30 text-danger border-transparent"       : "bg-danger-soft text-danger border-transparent",     dot: "bg-danger" },
      { key: "PENDING",  label: "En attente",                             count: pendingCount,  activeClass: dk ? "bg-warning/20 text-warning border-transparent" : "bg-warning-soft text-warning border-transparent", dot: "bg-warning" },
    ];

    return (
      <div data-theme={dk ? "dark" : undefined} className={`min-h-screen flex flex-col transition-colors duration-300 ${dk ? "bg-bg text-ink" : "bg-surface-sunken"}`}>
        {/* Progress bar */}
        <ProgressBar total={totalPhotos} approved={approvedCount} rejected={rejectedCount} />

        {/* Header */}
        <header className={`px-4 pt-4 pb-3 sticky top-0 z-10 transition-colors duration-300 ${dk ? "bg-bg/95" : "bg-surface border-b border-line"}`}>
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => {
                const firstPending = photos.findIndex((p) => p.status === "PENDING");
                setCurrentIndex(firstPending >= 0 ? firstPending : 0);
                setShowSummary(false);
                setSummaryFilter("ALL");
              }}
              className={`text-sm transition-colors ${dk ? "text-ink/70 hover:text-ink" : "text-ink-muted hover:text-ink"}`}
            >
              ← {pendingCount > 0 ? `${pendingCount} en attente` : "Retour"}
            </button>
            <span className={`text-sm font-medium truncate max-w-[35%] ${dk ? "text-ink/80" : "text-ink"}`}>{event.name}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-sm tabular-nums ${dk ? "text-ink/50" : "text-ink-subtle"}`}>{totalPhotos} photos</span>
              {/* Theme toggle */}
              <button
                onClick={() => setSummaryDark((v) => !v)}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${dk ? "bg-ink/10 hover:bg-ink/20 text-ink/70" : "bg-surface-sunken hover:bg-surface-sunken text-ink-muted"}`}
                aria-label="Basculer le thème"
              >
                {dk ? (
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className={`rounded-xl px-3 py-2.5 text-center border ${dk ? "bg-success/15 border-success/30" : "bg-success-soft border-success/30"}`}>
              <p className={`text-2xl font-bold tabular-nums ${dk ? "text-success" : "text-success"}`}>{approvedCount}</p>
              <p className={`text-xs mt-0.5 ${dk ? "text-success/70" : "text-success"}`}>{labels.approvedPlural}</p>
            </div>
            <div className={`rounded-xl px-3 py-2.5 text-center border ${dk ? "bg-ink/5 border-ink/10" : "bg-surface-sunken border-line"}`}>
              <p className={`text-2xl font-bold tabular-nums ${dk ? "text-ink/50" : "text-ink-subtle"}`}>{pendingCount}</p>
              <p className={`text-xs mt-0.5 ${dk ? "text-ink/30" : "text-ink-subtle"}`}>en attente</p>
            </div>
            <div className={`rounded-xl px-3 py-2.5 text-center border ${dk ? "bg-danger/15 border-danger/30" : "bg-danger-soft border-danger/30"}`}>
              <p className={`text-2xl font-bold tabular-nums ${dk ? "text-danger" : "text-danger"}`}>{rejectedCount}</p>
              <p className={`text-xs mt-0.5 ${dk ? "text-danger/70" : "text-danger"}`}>{labels.rejectedPlural}</p>
            </div>
          </div>

          {/* Filter pills */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {filterConfig.map(({ key, label, count, activeClass, dot }) => (
              <button
                key={key}
                onClick={() => setSummaryFilter(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 border transition-colors ${
                  summaryFilter === key
                    ? activeClass
                    : dk
                      ? "bg-transparent text-ink/40 border-ink/10 hover:text-ink/60 hover:border-ink/20"
                      : "bg-transparent text-ink-subtle border-line hover:text-ink-muted hover:border-control-line"
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
        <div className={`grid grid-cols-5 sm:grid-cols-6 md:grid-cols-7 gap-1 p-2 flex-1 ${dk ? "" : "bg-surface-sunken"}`}>
          {filteredPhotos.map((photo) => {
            const isApproved = photo.status === "APPROVED" || photo.status === "PREVALIDATED";
            const isRejected = photo.status === "REJECTED"  || photo.status === "PREREJECTED";
            return (
              <button
                key={photo.id}
                onClick={() => void toggleDecision(photo.id)}
                className="relative aspect-square overflow-hidden rounded-sm bg-surface-sunken"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.thumbnailUrl} alt={photo.filename} className="w-full h-full object-cover" />
                {/* Corner badge */}
                {isApproved && (
                  <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-success flex items-center justify-center shadow-float">
                    <span className="text-surface text-[10px] font-bold leading-none">✓</span>
                  </div>
                )}
                {isRejected && (
                  <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-danger flex items-center justify-center shadow-float">
                    <span className="text-on-danger text-[10px] font-bold leading-none">✗</span>
                  </div>
                )}
                {photo.status === "PENDING" && (
                  <div className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-warning shadow-float" />
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
    <div data-theme="dark" className="contents">
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

      <div className="min-h-screen bg-bg text-ink flex flex-col select-none overflow-hidden">
        {/* Progress bar */}
        <ProgressBar total={totalPhotos} approved={approvedCount} rejected={rejectedCount} />

        {/* Header */}
        <header className="bg-scrim/80 text-on-brand px-4 py-3 flex items-center justify-between shrink-0">
          <div className="text-sm truncate max-w-[35%] text-on-brand/80">{event.name}</div>

          <div className="flex items-center gap-2">
            {/* Jump to next pending */}
            {!allDecided && currentPhoto?.status !== "PENDING" && anyPendingIndex >= 0 && (
              <button
                onClick={() => setCurrentIndex(anyPendingIndex)}
                className="text-xs text-warning hover:text-warning bg-warning/40 border border-warning/50 rounded-full px-2.5 py-0.5 transition-colors"
              >
                {pendingCount} en attente →
              </button>
            )}
            <button
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
              className="text-on-brand disabled:opacity-30 text-xl px-1"
              aria-label="Photo précédente"
            >
              ‹
            </button>
            <span className="text-sm tabular-nums text-on-brand/90">{currentIndex + 1}/{totalPhotos}</span>
            <button
              onClick={() => setCurrentIndex((i) => Math.min(totalPhotos - 1, i + 1))}
              disabled={currentIndex === totalPhotos - 1}
              className="text-on-brand disabled:opacity-30 text-xl px-1"
              aria-label="Photo suivante"
            >
              ›
            </button>
          </div>

          <button onClick={() => setShowSummary(true)} className="text-sm text-on-brand/70 hover:text-on-brand">
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
                    className={`m-4 w-14 h-14 rounded-full flex items-center justify-center text-2xl text-on-danger ${
                      dragX > 0 ? "bg-success" : "bg-danger"
                    }`}
                  >
                    {dragX > 0 ? "✓" : "✗"}
                  </div>
                </div>
              )}

              {/* Decision badge */}
              {dragX === 0 && currentPhoto.status !== "PENDING" && (
                <div className="absolute top-3 left-3">
                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[currentPhoto.status] ?? "bg-surface-sunken text-ink-subtle"}`}>
                    {STATUS_LABELS[currentPhoto.status] ?? currentPhoto.status}
                  </span>
                </div>
              )}

              {/* HD button — tap opens lightbox */}
              <button
                onClick={() => setShowHdLightbox(true)}
                className="absolute bottom-3 right-3 text-xs text-on-brand/60 hover:text-on-brand bg-scrim hover:bg-scrim rounded-lg px-2.5 py-1.5 transition-colors flex items-center gap-1"
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
        <div className="bg-scrim px-4 py-1.5 flex items-center justify-center gap-4 shrink-0">
          <span className="text-xs text-success tabular-nums">{approvedCount} {labels.approvedPlural}</span>
          <span className="text-xs text-ink-subtle" aria-hidden>·</span>
          <span className="text-xs text-ink-subtle tabular-nums">{pendingCount} en attente</span>
          <span className="text-xs text-ink-subtle" aria-hidden>·</span>
          <span className="text-xs text-danger tabular-nums">{rejectedCount} {labels.rejectedPlural}</span>
        </div>

        {/* "All decided" banner */}
        {allDecided && (
          <div className="bg-success text-surface text-sm px-4 py-2 text-center shrink-0">
            Tout est traité.{" "}
            <button onClick={() => setShowSummary(true)} className="font-bold underline">
              Voir le récap
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div
          className="bg-scrim/80 px-4 pt-4 flex items-center justify-center gap-5 shrink-0"
          style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        >
          <button
            onClick={() => void makeDecision(rejectStatus)}
            disabled={!!saving[currentPhoto?.id ?? ""]}
            className="w-16 h-16 rounded-full bg-danger text-on-danger flex items-center justify-center text-2xl hover:bg-danger/90 active:scale-95 transition-all disabled:opacity-50 shadow-float"
            aria-label="Rejeter"
          >
            ✗
          </button>
          <button
            onClick={skipPhoto}
            className="w-12 h-12 rounded-full bg-surface text-ink flex items-center justify-center text-xs hover:bg-surface-sunken active:scale-95 transition-all"
            aria-label="Passer"
          >
            Passer
          </button>
          <button
            onClick={() => void makeDecision(approveStatus)}
            disabled={!!saving[currentPhoto?.id ?? ""]}
            className="w-16 h-16 rounded-full bg-success text-surface flex items-center justify-center text-2xl hover:bg-success/90 active:scale-95 transition-all disabled:opacity-50 shadow-float"
            aria-label="Valider"
          >
            ✓
          </button>
        </div>

        {/* Keyboard hints */}
        <div className="bg-scrim px-4 py-1 flex justify-center gap-4 shrink-0">
          <span className="text-[10px] text-ink-subtle">← X : rejeter</span>
          <span className="text-[10px] text-ink-subtle">Espace : passer</span>
          <span className="text-[10px] text-ink-subtle">→ V : valider</span>
          <span className="text-[10px] text-ink-subtle">H / Entrée : HD</span>
        </div>

        {/* Undo toast */}
        {undoAction && (
          <div
            className="fixed left-4 right-4 bg-surface text-ink rounded-xl px-4 py-3 flex items-center justify-between z-50 shadow-overlay"
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
            <button onClick={undo} className="text-brand-text font-bold text-sm ml-4">
              ANNULER
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
