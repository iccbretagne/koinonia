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

const STATUS_BORDER: Record<string, string> = {
  PENDING:      "border-gray-500",
  APPROVED:     "border-green-500",
  REJECTED:     "border-red-400",
  PREVALIDATED: "border-blue-400",
  PREREJECTED:  "border-orange-400",
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

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

type SummaryFilter = "ALL" | "APPROVED" | "REJECTED" | "PENDING";

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
  const [hdLoading, setHdLoading] = useState(false);

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

  async function openHd() {
    if (!currentPhoto) return;
    setHdLoading(true);
    try {
      const res = await fetch(`/api/media/validate/${token}/photo/${currentPhoto.id}`);
      const json = await res.json();
      if (json.data?.originalUrl) window.open(json.data.originalUrl, "_blank", "noopener");
    } finally {
      setHdLoading(false);
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (showSummary) return;
      if (e.key === "ArrowRight" || e.key === "v") void makeDecision(approveStatus);
      else if (e.key === "ArrowLeft" || e.key === "x") void makeDecision(rejectStatus);
      else if (e.key === " " || e.key === "ArrowDown") { e.preventDefault(); skipPhoto(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [makeDecision, skipPhoto, showSummary, approveStatus, rejectStatus]);

  // Swipe gesture handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (showSummary || !currentPhoto) return;
      pointerIdRef.current = e.pointerId;
      startXRef.current = e.clientX;
      setDragging(true);
      setDragX(0);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [showSummary, currentPhoto]
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
    const counts: Record<SummaryFilter, number> = {
      ALL: totalPhotos,
      APPROVED: approvedCount,
      REJECTED: rejectedCount,
      PENDING: pendingCount,
    };
    const filterLabels: Record<SummaryFilter, string> = {
      ALL: "Toutes",
      APPROVED: isPrevalidator ? "Gardées" : "Validées",
      REJECTED: isPrevalidator ? "Écartées" : "Rejetées",
      PENDING: "En attente",
    };
    const activeColors: Record<SummaryFilter, string> = {
      ALL:      "bg-gray-200 text-gray-800",
      APPROVED: "bg-green-100 text-green-800",
      REJECTED: "bg-red-100 text-red-800",
      PENDING:  "bg-yellow-100 text-yellow-800",
    };
    const filteredPhotos = photos.filter((p) => {
      if (summaryFilter === "ALL") return true;
      if (summaryFilter === "APPROVED") return p.status === "APPROVED" || p.status === "PREVALIDATED";
      if (summaryFilter === "REJECTED") return p.status === "REJECTED"  || p.status === "PREREJECTED";
      return p.status === "PENDING";
    });

    return (
      <div className="min-h-screen bg-gray-50 pb-6">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                const firstPending = photos.findIndex((p) => p.status === "PENDING");
                setCurrentIndex(firstPending >= 0 ? firstPending : 0);
                setShowSummary(false);
                setSummaryFilter("ALL");
              }}
              className="text-icc-violet font-medium text-sm"
            >
              ← Continuer
            </button>
            <span className="text-sm font-semibold text-gray-800 truncate max-w-[45%]">{event.name}</span>
            <span className="text-sm text-gray-500 shrink-0">
              {approvedCount}/{totalPhotos} {labels.approvedPlural}
            </span>
          </div>
        </header>

        {/* Filter tabs */}
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex gap-2 sticky top-[52px] z-10 overflow-x-auto">
          {(["ALL", "APPROVED", "REJECTED", "PENDING"] as SummaryFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setSummaryFilter(f)}
              className={`px-3 py-1 text-sm rounded-full whitespace-nowrap shrink-0 transition-colors ${
                summaryFilter === f ? activeColors[f] : "bg-gray-100 text-gray-600"
              }`}
            >
              {filterLabels[f]} ({counts[f]})
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-3 gap-0.5 p-0.5 mt-0.5">
          {filteredPhotos.map((photo) => (
            <button
              key={photo.id}
              onClick={() => void toggleDecision(photo.id)}
              className={`relative aspect-square bg-gray-200 overflow-hidden border-2 ${STATUS_BORDER[photo.status] ?? "border-gray-400"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.thumbnailUrl} alt={photo.filename} className="w-full h-full object-cover" />
              {photo.status !== "PENDING" && (
                <div
                  className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                    photo.status === "APPROVED" || photo.status === "PREVALIDATED" ? "bg-green-500" : "bg-red-500"
                  }`}
                >
                  {photo.status === "APPROVED" || photo.status === "PREVALIDATED" ? "✓" : "✗"}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Card-swipe view ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black flex flex-col select-none overflow-hidden">
      {/* Header */}
      <header className="bg-black/80 text-white px-4 py-3 flex items-center justify-between shrink-0">
        <div className="text-sm truncate max-w-[40%] text-white/80">{event.name}</div>
        <div className="flex items-center gap-2">
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
              className="max-w-[90vw] max-h-[68vh] object-contain"
              draggable={false}
            />

            {/* Swipe feedback indicators */}
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

            {/* Current decision badge */}
            {dragX === 0 && currentPhoto.status !== "PENDING" && (
              <div className="absolute top-3 left-3">
                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[currentPhoto.status] ?? "bg-gray-700 text-white"}`}>
                  {STATUS_LABELS[currentPhoto.status] ?? currentPhoto.status}
                </span>
              </div>
            )}

            {/* HD button */}
            <button
              onClick={openHd}
              disabled={hdLoading}
              className="absolute bottom-3 right-3 text-xs text-white/60 hover:text-white bg-black/40 rounded px-2 py-1 transition-colors disabled:opacity-40"
            >
              {hdLoading ? "…" : "HD"}
            </button>
          </div>
        )}
      </div>

      {/* Event info bar */}
      <div className="bg-black/60 px-4 py-1.5 text-center shrink-0">
        <p className="text-xs text-white/40">{formatDate(event.date)}</p>
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
  );
}
