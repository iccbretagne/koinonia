"use client";

import { useState, useCallback } from "react";

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
    totalFiles: number;
    approvedCount: number;
    pendingCount: number;
    rejectedCount: number;
  };
  files: ProjectFile[];
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT:           "bg-gray-700 text-gray-200",
  IN_REVIEW:       "bg-yellow-600 text-white",
  PREVALIDATED:    "bg-blue-600 text-white",
  PREREJECTED:     "bg-orange-600 text-white",
  APPROVED:        "bg-green-600 text-white",
  FINAL_APPROVED:  "bg-emerald-700 text-white",
  REJECTED:        "bg-red-600 text-white",
  REVISION_REQUESTED: "bg-purple-600 text-white",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT:           "Brouillon",
  IN_REVIEW:       "En révision",
  PREVALIDATED:    "Pré-validé",
  PREREJECTED:     "Pré-rejeté",
  APPROVED:        "Approuvé",
  FINAL_APPROVED:  "Validé définitivement",
  REJECTED:        "Rejeté",
  REVISION_REQUESTED: "Révision demandée",
};

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("video/")) return (
    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
    </svg>
  );
  if (mimeType === "application/pdf") return (
    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
  return (
    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

export default function ProjectValidatorView({ token, data }: { token: string; data: ProjectValidationData }) {
  const { project } = data;
  const isPrevalidator = data.token.type === "PREVALIDATOR";
  const approveStatus = isPrevalidator ? "PREVALIDATED" : "APPROVED";
  const rejectStatus = isPrevalidator ? "PREREJECTED" : "REJECTED";
  const labels = isPrevalidator
    ? { approve: "Pré-valider", reject: "Écarter" }
    : { approve: "Approuver", reject: "Rejeter" };

  const [files, setFiles] = useState<ProjectFile[]>(data.files);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const isPending = (f: ProjectFile) =>
    f.status === "IN_REVIEW" || f.status === "PREVALIDATED" || f.status === "DRAFT";
  const pendingCount = files.filter(isPending).length;
  const approvedCount = files.filter((f) => f.status === "APPROVED" || f.status === "PREVALIDATED" || f.status === "FINAL_APPROVED").length;
  const rejectedCount = files.filter((f) => f.status === "REJECTED" || f.status === "PREREJECTED").length;

  const setStatus = useCallback(async (fileId: string, status: string) => {
    setSaving((prev) => ({ ...prev, [fileId]: true }));
    try {
      const res = await fetch(`/api/media/validate/${token}/file/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, status } : f));
      }
    } finally {
      setSaving((prev) => ({ ...prev, [fileId]: false }));
    }
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-gray-900/95 border-b border-white/10 px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs text-gray-400 mb-0.5">{data.token.label ?? (isPrevalidator ? "Pré-validation" : "Validation")}</p>
          <h1 className="text-lg font-semibold truncate">{project.name}</h1>
          <div className="flex gap-4 mt-2 text-xs">
            <span className="text-green-400">{approvedCount} {isPrevalidator ? "pré-validés" : "approuvés"}</span>
            <span className="text-gray-500">{pendingCount} en attente</span>
            <span className="text-red-400">{rejectedCount} rejetés</span>
          </div>
        </div>
      </header>

      {/* Files list */}
      <main className="max-w-3xl mx-auto px-4 py-4 space-y-3">
        {files.length === 0 && (
          <p className="text-center text-gray-500 py-12">Aucun fichier à valider.</p>
        )}

        {files.map((file) => {
          const canDecide = isPending(file);
          const isSaving = saving[file.id];

          return (
            <div key={file.id} className="bg-gray-900 rounded-xl border border-white/10 overflow-hidden">
              <div className="flex items-center gap-3 p-3">
                {/* Preview */}
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-800 shrink-0 flex items-center justify-center">
                  {file.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={file.thumbnailUrl} alt={file.filename} className="w-full h-full object-cover" />
                  ) : (
                    <FileTypeIcon mimeType={file.mimeType} />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.filename}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatSize(file.size)}</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold rounded-full ${STATUS_BADGE[file.status] ?? "bg-gray-700 text-gray-300"}`}>
                    {STATUS_LABELS[file.status] ?? file.status}
                  </span>
                </div>
              </div>

              {/* Actions */}
              {canDecide && (
                <div className="flex border-t border-white/10">
                  <button
                    onClick={() => void setStatus(file.id, rejectStatus)}
                    disabled={isSaving}
                    className="flex-1 py-2.5 text-sm text-red-400 hover:bg-red-900/30 disabled:opacity-50 transition-colors font-medium"
                  >
                    ✗ {labels.reject}
                  </button>
                  <div className="w-px bg-white/10" />
                  <button
                    onClick={() => void setStatus(file.id, approveStatus)}
                    disabled={isSaving}
                    className="flex-1 py-2.5 text-sm text-green-400 hover:bg-green-900/30 disabled:opacity-50 transition-colors font-medium"
                  >
                    ✓ {labels.approve}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {files.length > 0 && pendingCount === 0 && (
          <div className="text-center py-8 text-green-400">
            <p className="text-lg font-semibold">Tout est traité ✓</p>
            <p className="text-sm text-gray-400 mt-1">{approvedCount} approuvés · {rejectedCount} rejetés</p>
          </div>
        )}
      </main>
    </div>
  );
}
