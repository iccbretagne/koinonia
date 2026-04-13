"use client";

import Link from "next/link";
import { useState } from "react";

type MediaProject = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  createdBy: { id: string; name: string | null; displayName: string | null };
  _count: { files: number };
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

  const filtered = projects.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Rechercher…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full sm:w-80 border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
      />

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

      <div className="grid gap-4">
        {filtered.map((project) => (
          <Link
            key={project.id}
            href={`/media/projects/${project.id}`}
            className="block bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-icc-violet transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-gray-900 truncate">{project.name}</h2>
                {project.description && (
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">{project.description}</p>
                )}
                <p className="text-xs text-gray-400 mt-2">
                  Créé le {formatDate(project.createdAt)} par{" "}
                  {project.createdBy.displayName || project.createdBy.name || "—"}
                </p>
              </div>
              <div className="text-sm text-gray-500 shrink-0">
                {project._count.files} fichier{project._count.files !== 1 ? "s" : ""}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
