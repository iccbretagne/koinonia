"use client";

import Link from "next/link";
import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Checkbox, SearchInput, StatusChip, buttonClasses } from "@/components/ui";
import CollectionBuilder from "../partages/CollectionBuilder";
import { paths } from "@/lib/paths";

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
  churchId,
  canShare,
}: {
  readonly projects: MediaProject[];
  readonly canUpload: boolean;
  readonly churchId: string;
  readonly canShare: boolean;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shareModalOpen, setShareModalOpen] = useState(false);

  function toggleSelected(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const filtered = projects.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="w-full sm:w-80">
        <SearchInput aria-label="Rechercher un projet" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {canShare && selected.size > 0 && (
        <div className="sticky top-0 z-10 bg-brand-soft border border-brand/30 rounded-card px-4 py-2 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-ink-muted">{selected.size} projet{selected.size > 1 ? "s" : ""} sélectionné{selected.size > 1 ? "s" : ""}</span>
          <Button size="sm" onClick={() => setShareModalOpen(true)}>Partager la sélection</Button>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-ink-muted">
          {projects.length === 0 ? (
            <>
              <p className="text-lg font-medium mb-2">Aucun projet média</p>
              {canUpload && (
                <Link href={paths.media.newProject()} className={buttonClasses("secondary")}>
                  Créer le premier projet
                </Link>
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
              href={paths.media.project(project.id)}
              className={`block bg-surface rounded-card shadow-card border p-4 hover:border-brand transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                hasActivity ? "border-warning/30" : "border-line"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                {canShare && (
                  <Checkbox
                    aria-label={`Sélectionner ${project.name}`}
                    checked={selected.has(project.id)}
                    onClick={(e) => toggleSelected(project.id, e)}
                    onChange={() => {}}
                    className="shrink-0 mt-0.5"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-ink truncate">{project.name}</h2>
                  {project.description && (
                    <p className="text-sm text-ink-muted mt-1 line-clamp-1">{project.description}</p>
                  )}
                  <p className="text-xs text-ink-subtle mt-1">
                    Créé le {formatDate(project.createdAt)} par{" "}
                    {project.createdBy.displayName || project.createdBy.name || "—"}
                  </p>

                  {/* Indicateurs de statut fichiers */}
                  {total > 0 && hasActivity && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {inReview > 0 && (
                        <StatusChip tone="brand">{inReview} en révision</StatusChip>
                      )}
                      {revisionRequested > 0 && (
                        <StatusChip tone="warning">
                          {revisionRequested} {revisionRequested > 1 ? "révisions demandées" : "révision demandée"}
                        </StatusChip>
                      )}
                      {pending > 0 && (
                        <StatusChip tone="warning">{pending} en attente</StatusChip>
                      )}
                    </div>
                  )}
                  {total > 0 && finalApproved > 0 && (
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-1 bg-surface-sunken rounded-full overflow-hidden">
                        <div className="h-full bg-success transition-all" style={{ width: `${(finalApproved / total) * 100}%` }} />
                      </div>
                      <span className="text-xs text-ink-subtle shrink-0">{Math.round((finalApproved / total) * 100)}% validé</span>
                    </div>
                  )}
                </div>

                <div className="text-xs text-ink-subtle shrink-0 text-right">
                  <p>{total} fichier{total !== 1 ? "s" : ""}</p>
                  {finalApproved > 0 && (
                    <p className="text-success font-medium">{finalApproved} validé{finalApproved > 1 ? "s" : ""}</p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {canShare && (
        <Modal open={shareModalOpen} onClose={() => setShareModalOpen(false)} title="Partager la sélection">
          <CollectionBuilder
            churchId={churchId}
            events={[]}
            projects={projects.map((p) => ({
              id: p.id,
              name: p.name,
              createdAt: p.createdAt.toISOString(),
              approvedFileCount: p.fileCounts.finalApproved,
            }))}
            initialProjectIds={Array.from(selected)}
            lockedScope="files"
            onCreated={() => setShareModalOpen(false)}
          />
        </Modal>
      )}
    </div>
  );
}
