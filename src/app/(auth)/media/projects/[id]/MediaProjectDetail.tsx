"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import type { MediaFileStatus, MediaFileType, MediaTokenType } from "@/generated/prisma/enums";

type FileVersion = {
  id: string;
  versionNumber: number;
  originalKey: string;
  thumbnailKey: string;
  notes: string | null;
  createdAt: Date;
};

type MediaFile = {
  id: string;
  type: MediaFileType;
  status: MediaFileStatus;
  filename: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  createdAt: Date;
  updatedAt: Date;
  versions: FileVersion[];
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

type MediaProject = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  createdBy: { id: string; name: string | null; displayName: string | null };
  files: MediaFile[];
  shareTokens: ShareToken[];
  _count: { files: number };
};

const FILE_STATUS_LABELS: Record<MediaFileStatus, string> = {
  PENDING: "En attente",
  APPROVED: "Approuvé",
  REJECTED: "Rejeté",
  PREVALIDATED: "Pré-validé",
  PREREJECTED: "Pré-rejeté",
  DRAFT: "Brouillon",
  IN_REVIEW: "En révision",
  REVISION_REQUESTED: "Révision demandée",
  FINAL_APPROVED: "Validé final",
};

const FILE_STATUS_COLORS: Record<MediaFileStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  PREVALIDATED: "bg-blue-100 text-blue-800",
  PREREJECTED: "bg-orange-100 text-orange-800",
  DRAFT: "bg-gray-100 text-gray-700",
  IN_REVIEW: "bg-purple-100 text-purple-800",
  REVISION_REQUESTED: "bg-amber-100 text-amber-800",
  FINAL_APPROVED: "bg-emerald-100 text-emerald-800",
};

const FILE_TYPE_LABELS: Record<MediaFileType, string> = {
  PHOTO: "Photo",
  VISUAL: "Visuel",
  VIDEO: "Vidéo",
};

const TOKEN_TYPE_LABELS: Record<MediaTokenType, string> = {
  VALIDATOR: "Validateur",
  PREVALIDATOR: "Pré-validateur",
  MEDIA: "Téléchargement",
  GALLERY: "Galerie",
};

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function MediaProjectDetail({
  project: initialProject,
  canUpload: _canUpload,
  canReview,
  canManage,
}: {
  project: MediaProject;
  canUpload: boolean;
  canReview: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [typeFilter, setTypeFilter] = useState<MediaFileType | "">("");
  const [statusFilter, setStatusFilter] = useState<MediaFileStatus | "">("");
  const [creatingToken, setCreatingToken] = useState(false);
  const [newTokenType, setNewTokenType] = useState<MediaTokenType>("GALLERY");
  const [newTokenLabel, setNewTokenLabel] = useState("");
  const [tokenError, setTokenError] = useState<string | null>(null);

  async function refreshProject() {
    const res = await fetch(`/api/media-projects/${project.id}`);
    const json = await res.json();
    if (res.ok) setProject(json.data);
    router.refresh();
  }

  const filteredFiles = project.files.filter((f) => {
    if (typeFilter && f.type !== typeFilter) return false;
    if (statusFilter && f.status !== statusFilter) return false;
    return true;
  });

  async function deleteProject() {
    if (!confirm(`Supprimer le projet "${project.name}" et tous ses fichiers ?`)) return;
    await fetch(`/api/media-projects/${project.id}`, { method: "DELETE" });
    router.push("/media/projects");
  }

  async function reviewFile(fileId: string, status: "APPROVED" | "REJECTED" | "REVISION_REQUESTED" | "FINAL_APPROVED") {
    await fetch(`/api/media/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await refreshProject();
  }

  async function createToken() {
    setTokenError(null);
    setCreatingToken(true);
    try {
      const res = await fetch(`/api/media-projects/${project.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: newTokenType, label: newTokenLabel || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      setNewTokenLabel("");
      await refreshProject();
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setCreatingToken(false);
    }
  }

  async function deleteToken(tokenId: string) {
    if (!confirm("Supprimer ce lien de partage ?")) return;
    await fetch(`/api/media-projects/${project.id}/share?tokenId=${tokenId}`, { method: "DELETE" });
    await refreshProject();
  }

  function getTokenUrl(token: ShareToken) {
    const paths: Record<MediaTokenType, string> = { VALIDATOR: "v", PREVALIDATOR: "v", MEDIA: "d", GALLERY: "g" };
    return `${window.location.origin}/media/${paths[token.type]}/${token.token}`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1">
            <Link href="/media/projects" className="text-sm text-gray-500 hover:text-gray-700">
              ← Projets
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
            <span>Créé le {formatDate(project.createdAt)}</span>
            <span className="text-gray-300">|</span>
            <span>{project._count.files} fichier{project._count.files !== 1 ? "s" : ""}</span>
          </div>
          {project.description && <p className="text-sm text-gray-600 mt-2">{project.description}</p>}
        </div>
        {canManage && (
          <button
            onClick={deleteProject}
            className="text-sm text-red-600 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors shrink-0"
          >
            Supprimer
          </button>
        )}
      </div>

      {/* Files */}
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Fichiers ({project._count.files})</h2>
          <div className="flex items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as MediaFileType | "")}
              className="border-2 border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
            >
              <option value="">Tous types</option>
              {(Object.keys(FILE_TYPE_LABELS) as MediaFileType[]).map((t) => (
                <option key={t} value={t}>{FILE_TYPE_LABELS[t]}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as MediaFileStatus | "")}
              className="border-2 border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
            >
              <option value="">Tous statuts</option>
              {(Object.keys(FILE_STATUS_LABELS) as MediaFileStatus[]).map((s) => (
                <option key={s} value={s}>{FILE_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
        </div>

        {filteredFiles.length === 0 ? (
          <p className="text-gray-500 text-sm py-6 text-center">
            {project.files.length === 0 ? "Aucun fichier dans ce projet." : "Aucun fichier ne correspond aux filtres."}
          </p>
        ) : (
          <div className="space-y-2">
            {filteredFiles.map((file) => (
              <div key={file.id} className="flex items-center justify-between gap-3 p-3 bg-white border-2 border-gray-200 rounded-lg hover:border-icc-violet transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      {FILE_TYPE_LABELS[file.type]}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${FILE_STATUS_COLORS[file.status]}`}>
                      {FILE_STATUS_LABELS[file.status]}
                    </span>
                    <span className="text-sm font-medium text-gray-900 truncate">{file.filename}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatSize(file.size)} · v{file.versions[0]?.versionNumber ?? 1} · {formatDate(file.createdAt)}
                  </p>
                </div>
                {canReview && (
                  <div className="flex gap-1 shrink-0">
                    {file.status === "IN_REVIEW" && (
                      <>
                        <button
                          onClick={() => reviewFile(file.id, "FINAL_APPROVED")}
                          className="text-xs text-green-700 border border-green-200 rounded px-2 py-1 hover:bg-green-50"
                        >
                          Valider
                        </button>
                        <button
                          onClick={() => reviewFile(file.id, "REVISION_REQUESTED")}
                          className="text-xs text-amber-700 border border-amber-200 rounded px-2 py-1 hover:bg-amber-50"
                        >
                          Révision
                        </button>
                        <button
                          onClick={() => reviewFile(file.id, "REJECTED")}
                          className="text-xs text-red-700 border border-red-200 rounded px-2 py-1 hover:bg-red-50"
                        >
                          Rejeter
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Share tokens */}
      {canManage && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Liens de partage</h2>
          <div className="space-y-3">
            {project.shareTokens.map((token) => (
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
                value={newTokenType}
                onChange={(e) => setNewTokenType(e.target.value as MediaTokenType)}
                className="border-2 border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
              >
                {(Object.keys(TOKEN_TYPE_LABELS) as MediaTokenType[]).map((t) => (
                  <option key={t} value={t}>{TOKEN_TYPE_LABELS[t]}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Étiquette (optionnel)"
                value={newTokenLabel}
                onChange={(e) => setNewTokenLabel(e.target.value)}
                className="flex-1 border-2 border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
              />
              <Button onClick={createToken} disabled={creatingToken} size="sm">
                {creatingToken ? "…" : "+ Lien"}
              </Button>
            </div>
            {tokenError && <p className="text-xs text-red-600">{tokenError}</p>}
          </div>
        </section>
      )}
    </div>
  );
}
