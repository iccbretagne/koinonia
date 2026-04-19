"use client";

import Link from "next/link";
import { useState } from "react";

type FileCounts = { inReview: number; revisionRequested: number; finalApproved: number; pending: number };

type MediaProject = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  createdBy: { id: string; name: string | null; displayName: string | null };
  _count: { files: number };
  fileCounts: FileCounts;
};

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function MediaProjectsList({
  projects,
  canUpload,
}: {
  projects: MediaProject[];
  canUpload: boolean;
}) {
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = projects.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    const d = new Date(p.createdAt);
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo   && d > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });

  const hasDateFilter = dateFrom || dateTo;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <input
          type="text"
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-96 border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
        />
        <div className="flex flex-col sm:flex-row items-center gap-2">
          <div className="flex items-center gap-2 flex-1">
            <label className="text-xs text-gray-500 shrink-0">Du</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="flex-1 border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2 flex-1">
            <label className="text-xs text-gray-500 shrink-0">au</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
            />
          </div>
          {hasDateFilter && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-xs text-gray-400 hover:text-icc-violet transition-colors shrink-0 px-2 py-1"
            >
              Effacer dates
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {projects.length === 0 ? (
            <>
              <p className="text-lg font-medium mb-2">Aucun projet média</p>
              {canUpload && (
                <p className="text-sm">
                  <Link href="/media/projects/new" className="text-icc-violet hover:underline">
                    Créer le premier projet
                  </Link>
                </p>
              )}
            </>
          ) : (
            <p>Aucun projet ne correspond à la recherche.</p>
          )}
        </div>
      )}

      <div className="grid gap-3">
        {filtered.map((project) => {
          const { inReview, revisionRequested, finalApproved, pending } = project.fileCounts;
          const total = project._count.files;
          const hasActivity = inReview > 0 || revisionRequested > 0 || pending > 0;

          return (
            <Link
              key={project.id}
              href={`/media/projects/${project.id}`}
              className={`block bg-white rounded-xl border-2 p-4 hover:border-icc-violet transition-colors ${
                hasActivity ? "border-amber-200" : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">{project.name}</h2>
                  {project.description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-1">{project.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Créé le {formatDate(project.createdAt)} par{" "}
                    {project.createdBy.displayName || project.createdBy.name || "—"}
                  </p>

                  {/* Indicateurs de statut fichiers */}
                  {total > 0 && hasActivity && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {inReview > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                          {inReview} en révision
                        </span>
                      )}
                      {revisionRequested > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                          {revisionRequested} révision demandée{revisionRequested > 1 ? "s" : ""}
                        </span>
                      )}
                      {pending > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs bg-yellow-50 text-yellow-800 border border-yellow-200 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
                          {pending} en attente
                        </span>
                      )}
                    </div>
                  )}
                  {total > 0 && finalApproved > 0 && (
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400 transition-all" style={{ width: `${(finalApproved / total) * 100}%` }} />
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{Math.round((finalApproved / total) * 100)}% validé</span>
                    </div>
                  )}
                </div>

                <div className="text-xs text-gray-400 shrink-0 text-right">
                  <p>{total} fichier{total !== 1 ? "s" : ""}</p>
                  {finalApproved > 0 && (
                    <p className="text-emerald-600 font-medium">{finalApproved} validé{finalApproved > 1 ? "s" : ""}</p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
