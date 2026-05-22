"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ProjectFile = {
  id: string;
  filename: string;
  type: string;
  mimeType: string;
  size: number;
  status: string;
  thumbnailUrl: string | null;
};

type ProjectValidationData = {
  type: "project";
  token: { id: string; type: string; label: string | null };
  project: {
    id: string;
    name: string;
    isPrevalidator: boolean;
    hasPrevalidator: boolean;
    totalFiles: number;
  };
  files: ProjectFile[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  IN_REVIEW:          "bg-yellow-600 text-white",
  PREVALIDATED:       "bg-blue-600 text-white",
  PREREJECTED:        "bg-orange-600 text-white",
  APPROVED:           "bg-green-600 text-white",
  FINAL_APPROVED:     "bg-emerald-700 text-white",
  REJECTED:           "bg-red-600 text-white",
  REVISION_REQUESTED: "bg-purple-600 text-white",
};

const STATUS_LABELS: Record<string, string> = {
  IN_REVIEW:          "En révision",
  PREVALIDATED:       "Pré-validé",
  PREREJECTED:        "Pré-rejeté",
  APPROVED:           "Approuvé",
  FINAL_APPROVED:     "Validé définitivement",
  REJECTED:           "Rejeté",
  REVISION_REQUESTED: "Révision demandée",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// A file is actionable (shows action buttons, counted as "en attente") when it has no decision yet.
// REVISION_REQUESTED / APPROVED / REJECTED are already decided — not pending from the validator's view.
function isActionable(status: string, isPrevalidator: boolean, hasPrevalidator: boolean): boolean {
  if (isPrevalidator) return status === "IN_REVIEW";
  if (hasPrevalidator) return status === "PREVALIDATED";
  return status === "IN_REVIEW";
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ total, approved, rejected }: { total: number; approved: number; rejected: number }) {
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

// ── File type icon ────────────────────────────────────────────────────────────

function FileTypeIcon({ mimeType, className = "w-16 h-16" }: { mimeType: string; className?: string }) {
  if (mimeType.startsWith("video/")) return (
    <svg className={`${className} text-gray-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
    </svg>
  );
  if (mimeType === "application/pdf") return (
    <svg className={`${className} text-gray-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
  return (
    <svg className={`${className} text-gray-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

// ── Image lightbox ────────────────────────────────────────────────────────────

function ImageLightbox({ file, token, onClose }: { file: ProjectFile; token: string; onClose: () => void }) {
  const [hdUrl, setHdUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/media/validate/${token}/file/${file.id}`)
      .then((r) => r.json())
      .then((j) => { if (j.originalUrl) setHdUrl(j.originalUrl); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [file.id, token]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 shrink-0" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <span className="text-white/60 text-xs truncate max-w-[60%]">{file.filename}</span>
        {hdUrl ? (
          <a href={hdUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="text-xs text-white/50 hover:text-white underline shrink-0 transition-colors">
            Ouvrir ↗
          </a>
        ) : <span />}
      </div>
      <div className="flex-1 flex items-center justify-center px-4" onClick={(e) => e.stopPropagation()}>
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hdUrl ?? file.thumbnailUrl ?? ""}
            alt={file.filename}
            className="max-w-full max-h-[80vh] object-contain rounded shadow-2xl"
            style={{ filter: loading && !hdUrl ? "blur(3px)" : "none", transition: "filter 300ms" }}
          />
          {loading && !hdUrl && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          )}
          {hdUrl && <div className="absolute top-2 right-2 text-[10px] text-white/40 bg-black/40 rounded px-1.5 py-0.5">HD</div>}
        </div>
      </div>
    </div>
  );
}

// ── Action drawer (reject / revision) ────────────────────────────────────────

function ActionDrawer({
  type,
  comment,
  onCommentChange,
  onConfirm,
  onCancel,
  saving,
  isPrevalidator,
}: {
  type: "reject" | "revision";
  comment: string;
  onCommentChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
  isPrevalidator: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isRevision = type === "revision";
  const canConfirm = !saving && (!isRevision || comment.trim().length > 0);

  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div
        className="relative bg-gray-900 border-t border-white/10 sm:border sm:rounded-2xl w-full sm:max-w-md p-4 sm:p-6 space-y-4 shadow-2xl rounded-t-2xl"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <p className="font-semibold text-white text-base">
          {isRevision
            ? "Demande de révision"
            : isPrevalidator ? "Écarter ce fichier" : "Rejeter ce fichier"}
        </p>
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">
            {isRevision ? "Modifications demandées *" : "Raison (optionnel)"}
          </label>
          <textarea
            ref={textareaRef}
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            rows={3}
            placeholder={
              isRevision
                ? "Décrivez les modifications à apporter…"
                : "Expliquez pourquoi ce fichier est rejeté…"
            }
            className="w-full bg-gray-800 text-white rounded-xl px-3 py-2.5 text-sm resize-none border border-white/10 focus:border-white/30 focus:outline-none placeholder-gray-600"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-sm text-gray-400 border border-white/10 rounded-xl hover:bg-white/5 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 ${
              isRevision
                ? "bg-purple-600 hover:bg-purple-700 text-white"
                : "bg-red-600 hover:bg-red-700 text-white"
            }`}
          >
            {saving
              ? "…"
              : isRevision
                ? "Demander révision"
                : isPrevalidator ? "Écarter" : "Rejeter"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Summary view ──────────────────────────────────────────────────────────────

type SummaryFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

function SummaryView({
  files,
  isPrevalidator,
  hasPrevalidator,
  projectName,
  onBack,
  onGoTo,
}: {
  files: ProjectFile[];
  isPrevalidator: boolean;
  hasPrevalidator: boolean;
  projectName: string;
  onBack: () => void;
  onGoTo: (index: number) => void;
}) {
  const [filter, setFilter] = useState<SummaryFilter>("ALL");

  const total        = files.length;
  const approvedCount = files.filter((f) =>
    f.status === "APPROVED" || f.status === "PREVALIDATED" || f.status === "FINAL_APPROVED"
  ).length;
  const rejectedCount = files.filter((f) =>
    f.status === "REJECTED" || f.status === "PREREJECTED"
  ).length;
  const pendingCount = files.filter((f) => isActionable(f.status, isPrevalidator, hasPrevalidator)).length;

  const filtered = files.filter((f) => {
    if (filter === "ALL")      return true;
    if (filter === "PENDING")  return isActionable(f.status, isPrevalidator, hasPrevalidator);
    if (filter === "APPROVED") return f.status === "APPROVED" || f.status === "PREVALIDATED" || f.status === "FINAL_APPROVED";
    return f.status === "REJECTED" || f.status === "PREREJECTED";
  });

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="sticky top-0 z-10 bg-gray-950/95 border-b border-white/10 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <button onClick={onBack} className="text-sm text-white/60 hover:text-white transition-colors">
            ← {pendingCount > 0 ? `${pendingCount} en attente` : "Retour"}
          </button>
          <span className="text-sm font-medium truncate max-w-[40%]">{projectName}</span>
          <span className="text-xs text-white/40 tabular-nums shrink-0">{total} fichier{total > 1 ? "s" : ""}</span>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-xl px-3 py-2 text-center bg-green-500/15 border border-green-500/30">
            <p className="text-xl font-bold text-green-400 tabular-nums">{approvedCount}</p>
            <p className="text-xs text-green-400/70">{isPrevalidator ? "pré-validés" : "approuvés"}</p>
          </div>
          <div className="rounded-xl px-3 py-2 text-center bg-white/5 border border-white/10">
            <p className="text-xl font-bold text-white/50 tabular-nums">{pendingCount}</p>
            <p className="text-xs text-white/30">en attente</p>
          </div>
          <div className="rounded-xl px-3 py-2 text-center bg-red-500/15 border border-red-500/30">
            <p className="text-xl font-bold text-red-400 tabular-nums">{rejectedCount}</p>
            <p className="text-xs text-red-400/70">{isPrevalidator ? "écartés" : "rejetés"}</p>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {([
            { key: "ALL" as const,      label: "Tous",                                             count: total },
            { key: "PENDING" as const,  label: "En attente",                                       count: pendingCount },
            { key: "APPROVED" as const, label: isPrevalidator ? "Pré-validés" : "Approuvés",       count: approvedCount },
            { key: "REJECTED" as const, label: isPrevalidator ? "Écartés" : "Rejetés",             count: rejectedCount },
          ] as const)
            .filter(({ key, count }) => key === "ALL" || count > 0)
            .map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 border transition-colors ${
                  filter === key
                    ? "bg-white/20 text-white border-transparent"
                    : "bg-transparent text-white/40 border-white/10 hover:text-white/60"
                }`}
              >
                {label} <span className="tabular-nums opacity-70">({count})</span>
              </button>
            ))}
        </div>
      </header>

      <div className="flex-1 p-3 space-y-2">
        {filtered.map((file) => {
          const originalIndex = files.findIndex((f) => f.id === file.id);
          const actionable = isActionable(file.status, isPrevalidator, hasPrevalidator);
          return (
            <button
              key={file.id}
              onClick={() => onGoTo(originalIndex)}
              className={`w-full text-left bg-gray-900 rounded-xl border overflow-hidden transition-colors hover:bg-gray-800 ${
                actionable ? "border-white/10" : "border-white/5"
              }`}
            >
              <div className="flex items-center gap-3 p-3">
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-800 shrink-0 flex items-center justify-center">
                  {file.mimeType.startsWith("image/") && file.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={file.thumbnailUrl} alt={file.filename} className="w-full h-full object-cover" />
                  ) : (
                    <FileTypeIcon mimeType={file.mimeType} className="w-7 h-7" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.filename}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatSize(file.size)}</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold rounded-full ${STATUS_BADGE[file.status] ?? "bg-gray-700 text-gray-300"}`}>
                    {STATUS_LABELS[file.status] ?? file.status}
                  </span>
                </div>
                {actionable && (
                  <svg className="w-4 h-4 text-white/30 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-gray-500 py-12 text-sm">Aucun fichier dans cette catégorie.</p>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ProjectValidatorView({ token, data }: { token: string; data: ProjectValidationData }) {
  const { project } = data;
  const isPrevalidator = data.token.type === "PREVALIDATOR";
  const hasPrevalidator = project.hasPrevalidator;
  const approveStatus = isPrevalidator ? "PREVALIDATED" : "APPROVED";
  const rejectStatus  = isPrevalidator ? "PREREJECTED"  : "REJECTED";

  const [files, setFiles] = useState<ProjectFile[]>(data.files);
  const [currentIndex, setCurrentIndex] = useState(() => {
    const first = data.files.findIndex((f) => isActionable(f.status, isPrevalidator, hasPrevalidator));
    return first >= 0 ? first : 0;
  });
  const [showSummary, setShowSummary] = useState(false);
  const [drawer, setDrawer] = useState<"reject" | "revision" | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [undoAction, setUndoAction] = useState<{ fileId: string; prevStatus: string } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Signed URL for video/PDF (loaded on demand per card)
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileUrlLoading, setFileUrlLoading] = useState(false);

  // Swipe
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef    = useRef(0);

  const currentFile  = files[currentIndex];
  const totalFiles   = files.length;
  const approvedCount = files.filter((f) => f.status === "APPROVED" || f.status === "PREVALIDATED" || f.status === "FINAL_APPROVED").length;
  const rejectedCount = files.filter((f) => f.status === "REJECTED"  || f.status === "PREREJECTED").length;
  const actionableCount = files.filter((f) => isActionable(f.status, isPrevalidator, hasPrevalidator)).length;
  const canAct = !!currentFile && isActionable(currentFile.status, isPrevalidator, hasPrevalidator);

  // Load signed URL when switching to a video or PDF card
  // (images use thumbnailUrl directly — fileUrl is only read for video/PDF in JSX)
  useEffect(() => {
    if (!currentFile || currentFile.mimeType.startsWith("image/")) return;
    setFileUrl(null);
    setFileUrlLoading(true);
    fetch(`/api/media/validate/${token}/file/${currentFile.id}`)
      .then((r) => r.json())
      .then((j) => { if (j.originalUrl) setFileUrl(j.originalUrl); })
      .catch(() => {})
      .finally(() => setFileUrlLoading(false));
  }, [currentFile?.id, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigate = useCallback((direction: 1 | -1) => {
    setCurrentIndex((i) => Math.max(0, Math.min(totalFiles - 1, i + direction)));
  }, [totalFiles]);

  const doAction = useCallback(async (status: string, commentText: string) => {
    if (!currentFile || saving) return;
    setSaving(true);
    const prevStatus = currentFile.status;
    const fileId = currentFile.id;

    // Compute updated files synchronously to find next actionable
    const newFiles = files.map((f) => f.id === fileId ? { ...f, status } : f);
    setFiles(newFiles);

    // Undo
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoAction({ fileId, prevStatus });
    undoTimerRef.current = setTimeout(() => setUndoAction(null), 3000);

    // Navigate to next actionable file (search forward, then backward)
    const nextIdx = newFiles.findIndex((f, i) => i > currentIndex && isActionable(f.status, isPrevalidator, hasPrevalidator));
    if (nextIdx >= 0) {
      setCurrentIndex(nextIdx);
    } else {
      const remaining = newFiles.some((f, i) => i !== currentIndex && isActionable(f.status, isPrevalidator, hasPrevalidator));
      if (!remaining) {
        setShowSummary(true);
      } else {
        // Some remain before current index, go back to first actionable
        const prevIdx = newFiles.findIndex((f) => isActionable(f.status, isPrevalidator, hasPrevalidator));
        if (prevIdx >= 0) setCurrentIndex(prevIdx);
        else setShowSummary(true);
      }
    }

    try {
      await fetch(`/api/media/validate/${token}/file/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(commentText.trim() && { comment: commentText.trim() }) }),
      });
    } catch { /* silent — optimistic already applied */ }

    setSaving(false);
  }, [currentFile, currentIndex, files, saving, token, isPrevalidator, hasPrevalidator]);

  const handleApprove = useCallback(() => void doAction(approveStatus, ""), [doAction, approveStatus]);

  const handleRejectConfirm = useCallback(() => {
    setDrawer(null);
    const c = comment;
    setComment("");
    void doAction(rejectStatus, c);
  }, [doAction, rejectStatus, comment]);

  const handleRevisionConfirm = useCallback(() => {
    if (!comment.trim()) return;
    setDrawer(null);
    const c = comment;
    setComment("");
    void doAction("REVISION_REQUESTED", c);
  }, [doAction, comment]);

  const undo = useCallback(() => {
    if (!undoAction) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const { fileId, prevStatus } = undoAction;
    setFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, status: prevStatus } : f));
    const idx = files.findIndex((f) => f.id === fileId);
    if (idx >= 0) { setCurrentIndex(idx); setShowSummary(false); }
    fetch(`/api/media/validate/${token}/file/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: prevStatus }),
    }).catch(() => {});
    setUndoAction(null);
  }, [undoAction, files, token]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (drawer || showLightbox || showSummary) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight" && canAct)  handleApprove();
      else if (e.key === "ArrowLeft" && canAct)  setDrawer("reject");
      else if ((e.key === "r" || e.key === "R") && canAct) setDrawer("revision");
      else if ((e.key === "h" || e.key === "H" || e.key === "Enter") && currentFile?.mimeType.startsWith("image/")) setShowLightbox(true);
      else if (e.key === "ArrowUp")   { e.preventDefault(); navigate(-1); }
      else if (e.key === "ArrowDown") { e.preventDefault(); navigate(1); }
      else if (e.key === " ")         { e.preventDefault(); navigate(1); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer, showLightbox, showSummary, canAct, handleApprove, navigate, currentFile]);

  // Swipe handlers
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (drawer || showLightbox || !canAct) return;
    pointerIdRef.current = e.pointerId;
    startXRef.current    = e.clientX;
    setDragging(true);
    setDragX(0);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [drawer, showLightbox, canAct]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || pointerIdRef.current !== e.pointerId) return;
    setDragX(e.clientX - startXRef.current);
  }, [dragging]);

  const handlePointerEnd = useCallback(() => {
    if (!dragging) return;
    const delta = dragX;
    setDragging(false);
    setDragX(0);
    pointerIdRef.current = null;
    if (Math.abs(delta) >= 80) void doAction(delta > 0 ? approveStatus : rejectStatus, "");
  }, [dragging, dragX, doAction, approveStatus, rejectStatus]);

  if (totalFiles === 0) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <p className="text-gray-500">Aucun fichier à valider.</p>
      </div>
    );
  }

  if (showSummary) {
    return (
      <SummaryView
        files={files}
        isPrevalidator={isPrevalidator}
        hasPrevalidator={hasPrevalidator}
        projectName={project.name}
        onBack={() => {
          const first = files.findIndex((f) => isActionable(f.status, isPrevalidator, hasPrevalidator));
          setCurrentIndex(first >= 0 ? first : 0);
          setShowSummary(false);
        }}
        onGoTo={(idx) => { setCurrentIndex(idx); setShowSummary(false); }}
      />
    );
  }

  const labels = isPrevalidator
    ? { approve: "Pré-valider", reject: "Écarter", revision: "Révision" }
    : { approve: "Approuver",   reject: "Rejeter",  revision: "Révision" };

  return (
    <>
      {showLightbox && currentFile && (
        <ImageLightbox file={currentFile} token={token} onClose={() => setShowLightbox(false)} />
      )}

      {drawer && (
        <ActionDrawer
          type={drawer}
          comment={comment}
          onCommentChange={setComment}
          onConfirm={drawer === "reject" ? handleRejectConfirm : handleRevisionConfirm}
          onCancel={() => { setDrawer(null); setComment(""); }}
          saving={saving}
          isPrevalidator={isPrevalidator}
        />
      )}

      <div className="min-h-screen bg-gray-950 text-white flex flex-col select-none overflow-hidden">
        {/* Progress bar */}
        <ProgressBar total={totalFiles} approved={approvedCount} rejected={rejectedCount} />

        {/* Header */}
        <header className="px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => navigate(-1)}
              disabled={currentIndex === 0}
              className="text-white/60 disabled:opacity-25 text-2xl w-8 flex items-center justify-center hover:text-white transition-colors"
              aria-label="Précédent"
            >‹</button>
            <span className="text-sm tabular-nums text-white/60 min-w-[3rem] text-center">{currentIndex + 1}/{totalFiles}</span>
            <button
              onClick={() => navigate(1)}
              disabled={currentIndex === totalFiles - 1}
              className="text-white/60 disabled:opacity-25 text-2xl w-8 flex items-center justify-center hover:text-white transition-colors"
              aria-label="Suivant"
            >›</button>
          </div>

          <p className="text-sm font-medium truncate max-w-[40%] text-center">{project.name}</p>

          <button onClick={() => setShowSummary(true)} className="text-sm text-white/60 hover:text-white transition-colors shrink-0">
            Récap
          </button>
        </header>

        {/* Preview area */}
        <div
          className="flex-1 flex flex-col items-center justify-center overflow-hidden relative px-4"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          style={{ touchAction: "pan-y" }}
        >
          {currentFile && (
            <div
              className="flex flex-col items-center w-full max-w-2xl"
              style={{
                transform: canAct ? `translateX(${dragX}px) rotate(${dragX / 25}deg)` : "none",
                transition: dragging ? "none" : "transform 150ms ease-out",
              }}
            >
              {/* File preview */}
              <div className="w-full flex items-center justify-center mb-3">
                {currentFile.mimeType.startsWith("image/") ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={currentFile.thumbnailUrl ?? ""}
                      alt={currentFile.filename}
                      className="max-w-[90vw] max-h-[48vh] sm:max-h-[58vh] object-contain rounded-lg shadow-2xl"
                      draggable={false}
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowLightbox(true); }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="absolute bottom-2 right-2 text-xs text-white/60 hover:text-white bg-black/50 hover:bg-black/70 rounded-lg px-2 py-1 flex items-center gap-1 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      HD
                    </button>
                  </div>
                ) : currentFile.mimeType.startsWith("video/") ? (
                  <div className="w-full max-w-[90vw] sm:max-w-[70vw]">
                    {fileUrlLoading ? (
                      <div className="h-48 sm:h-56 flex items-center justify-center">
                        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      </div>
                    ) : fileUrl ? (
                      <video
                        controls
                        src={fileUrl}
                        className="w-full max-h-[48vh] sm:max-h-[58vh] rounded-lg shadow-2xl bg-black"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="h-40 flex flex-col items-center justify-center gap-2">
                        <FileTypeIcon mimeType={currentFile.mimeType} />
                        <p className="text-gray-500 text-sm">Impossible de charger la vidéo</p>
                      </div>
                    )}
                  </div>
                ) : currentFile.mimeType === "application/pdf" ? (
                  <div className="flex flex-col items-center gap-4 py-6">
                    <FileTypeIcon mimeType={currentFile.mimeType} className="w-20 h-20" />
                    {fileUrlLoading ? (
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : fileUrl ? (
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm text-white/80 transition-colors"
                      >
                        Ouvrir le PDF ↗
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8">
                    <FileTypeIcon mimeType={currentFile.mimeType} />
                  </div>
                )}
              </div>

              {/* File info */}
              <p className="text-sm font-medium text-white/90 truncate max-w-[80vw] text-center">
                {currentFile.filename}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{formatSize(currentFile.size)}</p>
              {currentFile.status !== "IN_REVIEW" && (
                <span className={`mt-1.5 inline-block px-2.5 py-0.5 text-[11px] font-semibold rounded-full ${STATUS_BADGE[currentFile.status] ?? "bg-gray-700 text-gray-300"}`}>
                  {STATUS_LABELS[currentFile.status] ?? currentFile.status}
                </span>
              )}
            </div>
          )}

          {/* Swipe feedback overlay */}
          {canAct && dragX !== 0 && (
            <div
              className={`absolute inset-0 flex items-start ${dragX > 0 ? "justify-start" : "justify-end"} pointer-events-none`}
              style={{ opacity: Math.min(Math.abs(dragX) / 100, 1) }}
            >
              <div className={`m-4 mt-20 w-14 h-14 rounded-full flex items-center justify-center text-2xl text-white ${dragX > 0 ? "bg-green-500" : "bg-red-500"}`}>
                {dragX > 0 ? "✓" : "✗"}
              </div>
            </div>
          )}
        </div>

        {/* Stats bar */}
        <div className="px-4 py-1.5 flex items-center justify-center gap-3 shrink-0 text-xs">
          <span className="text-green-400 tabular-nums">{approvedCount} {isPrevalidator ? "pré-validés" : "approuvés"}</span>
          <span className="text-white/20">·</span>
          <span className="text-white/40 tabular-nums">{actionableCount} en attente</span>
          <span className="text-white/20">·</span>
          <span className="text-red-400 tabular-nums">{rejectedCount} {isPrevalidator ? "écartés" : "rejetés"}</span>
        </div>

        {/* All decided banner */}
        {actionableCount === 0 && totalFiles > 0 && (
          <div className="bg-green-700/80 text-white text-sm px-4 py-2 text-center shrink-0">
            Tout est traité.{" "}
            <button onClick={() => setShowSummary(true)} className="font-bold underline">Voir le récap</button>
          </div>
        )}

        {/* Action buttons */}
        {canAct ? (
          <div
            className="px-6 pt-3 flex items-center justify-center gap-4 shrink-0"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
          >
            <button
              onClick={() => setDrawer("reject")}
              disabled={saving}
              className="w-16 h-16 sm:w-14 sm:h-14 rounded-full bg-red-500 hover:bg-red-600 active:scale-95 text-white text-2xl flex items-center justify-center disabled:opacity-50 transition-all shadow-lg"
              aria-label={labels.reject}
              title={labels.reject}
            >✗</button>
            <button
              onClick={() => setDrawer("revision")}
              disabled={saving}
              className="w-12 h-12 sm:w-11 sm:h-11 rounded-full bg-purple-600 hover:bg-purple-700 active:scale-95 text-white flex items-center justify-center disabled:opacity-50 transition-all shadow-lg"
              aria-label={labels.revision}
              title={labels.revision}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={handleApprove}
              disabled={saving}
              className="w-16 h-16 sm:w-14 sm:h-14 rounded-full bg-green-500 hover:bg-green-600 active:scale-95 text-white text-2xl flex items-center justify-center disabled:opacity-50 transition-all shadow-lg"
              aria-label={labels.approve}
              title={labels.approve}
            >✓</button>
          </div>
        ) : (
          <div
            className="px-4 pt-2 flex items-center justify-center gap-2 shrink-0"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${STATUS_BADGE[currentFile?.status ?? ""] ?? "bg-gray-700 text-gray-300"}`}>
              {STATUS_LABELS[currentFile?.status ?? ""] ?? "—"}
            </span>
            <span className="text-xs text-gray-600">Aucune action disponible</span>
          </div>
        )}

        {/* Keyboard hints — desktop only */}
        {canAct && (
          <div className="hidden sm:flex px-4 py-1 justify-center gap-4 shrink-0">
            <span className="text-[10px] text-white/25">← : {labels.reject}</span>
            <span className="text-[10px] text-white/25">R : révision</span>
            <span className="text-[10px] text-white/25">→ : {labels.approve}</span>
            {currentFile?.mimeType.startsWith("image/") && (
              <span className="text-[10px] text-white/25">H : HD</span>
            )}
          </div>
        )}

        {/* Undo toast */}
        {undoAction && (
          <div
            className="fixed left-4 right-4 bg-gray-800 text-white rounded-xl px-4 py-3 flex items-center justify-between z-30 shadow-xl"
            style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
          >
            <span className="text-sm">
              {STATUS_LABELS[files.find((f) => f.id === undoAction.fileId)?.status ?? ""] ?? "Décision enregistrée"}
            </span>
            <button onClick={undo} className="text-icc-violet font-bold text-sm ml-4">ANNULER</button>
          </div>
        )}
      </div>
    </>
  );
}
