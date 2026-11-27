"use client";

import Link from "next/link";
import { useState } from "react";
import type { MediaEventStatus } from "@/generated/prisma/enums";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Checkbox, Input, SearchInput, Select, StatusChip, buttonClasses, type StatusTone } from "@/components/ui";
import CollectionBuilder from "../partages/CollectionBuilder";
import { paths } from "@/lib/paths";

type PhotoCounts = { pending: number; prevalidated: number; approved: number; rejected: number };

type MediaEvent = {
  id: string;
  name: string;
  date: Date;
  description: string | null;
  status: MediaEventStatus;
  createdAt: Date;
  createdBy: { id: string; name: string | null; displayName: string | null };
  planningEvent: { id: string; title: string; type: string; date: Date } | null;
  _count: { photos: number; files: number };
  photoCounts: PhotoCounts;
};

const STATUS_LABELS: Record<MediaEventStatus, string> = {
  DRAFT: "Brouillon",
  PENDING_REVIEW: "En révision",
  REVIEWED: "Validé",
  ARCHIVED: "Archivé",
};

const STATUS_TONE: Record<MediaEventStatus, StatusTone> = {
  DRAFT: "neutral",
  PENDING_REVIEW: "warning",
  REVIEWED: "success",
  ARCHIVED: "neutral",
};

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function MediaEventsList({
  events,
  canUpload,
  churchId,
  canShare,
}: {
  readonly events: MediaEvent[];
  readonly canUpload: boolean;
  readonly churchId: string;
  readonly canShare: boolean;
}) {
  const [statusFilter, setStatusFilter] = useState<MediaEventStatus | "">("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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

  const filtered = events.filter((e) => {
    if (statusFilter && e.status !== statusFilter) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
    const d = new Date(e.date);
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo   && d > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });

  const hasDateFilter = dateFrom || dateTo;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <SearchInput aria-label="Rechercher un événement" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
          <div className="sm:w-56">
            <Select
              label="Statut"
              hideLabel
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as MediaEventStatus | "")}
              placeholder="Tous les statuts"
              options={(Object.keys(STATUS_LABELS) as MediaEventStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-2">
          <div className="flex-1">
            <Input label="Du" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="flex-1">
            <Input label="Au" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          {hasDateFilter && (
            <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => { setDateFrom(""); setDateTo(""); }}>
              Effacer les dates
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-ink-muted">
          {events.length === 0 ? (
            <>
              <p className="text-lg font-medium mb-2">Aucun événement média</p>
              {canUpload && (
                <Link href={paths.media.newEvent()} className={buttonClasses("secondary")}>
                  Créer le premier événement
                </Link>
              )}
            </>
          ) : (
            <p>Aucun événement ne correspond aux filtres.</p>
          )}
        </div>
      )}

      {canShare && selected.size > 0 && (
        <div className="sticky top-0 z-10 bg-brand-soft border border-brand/30 rounded-card px-4 py-2 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-ink-muted">{selected.size} événement{selected.size > 1 ? "s" : ""} sélectionné{selected.size > 1 ? "s" : ""}</span>
          <Button size="sm" onClick={() => setShareModalOpen(true)}>Partager la sélection</Button>
        </div>
      )}

      <div className="grid gap-3">
        {filtered.map((event) => {
          const { pending, prevalidated, approved, rejected } = event.photoCounts;
          const total = event._count.photos;
          const done = approved + rejected;
          const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;
          const hasActivity = pending > 0 || prevalidated > 0;

          return (
            <Link
              key={event.id}
              href={paths.media.event(event.id)}
              className={`block bg-surface rounded-card shadow-card border p-4 hover:border-brand transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                hasActivity ? "border-warning/30" : "border-line"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                {canShare && (
                  <Checkbox
                    aria-label={`Sélectionner ${event.name}`}
                    checked={selected.has(event.id)}
                    onClick={(e) => toggleSelected(event.id, e)}
                    onChange={() => {}}
                    className="shrink-0 mt-0.5"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="font-semibold text-ink truncate">{event.name}</h2>
                    <StatusChip tone={STATUS_TONE[event.status]} className="shrink-0">
                      {STATUS_LABELS[event.status]}
                    </StatusChip>
                  </div>
                  <p className="text-sm text-ink-muted">{formatDate(event.date)}</p>
                  {event.planningEvent && (
                    <p className="text-xs text-brand-text mt-1">Lié à : {event.planningEvent.title}</p>
                  )}
                  {event.description && (
                    <p className="text-sm text-ink-muted mt-1 line-clamp-1">{event.description}</p>
                  )}

                  {/* Indicateurs de statut photos */}
                  {total > 0 && (
                    <div className="mt-2.5 space-y-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        {pending > 0 && (
                          <StatusChip tone="warning">{pending} en attente</StatusChip>
                        )}
                        {prevalidated > 0 && (
                          <StatusChip tone="info">{prevalidated} pré-validée{prevalidated > 1 ? "s" : ""}</StatusChip>
                        )}
                        {approved > 0 && (
                          <StatusChip tone="success">{approved} approuvée{approved > 1 ? "s" : ""}</StatusChip>
                        )}
                        {rejected > 0 && (
                          <StatusChip tone="danger">{rejected} rejetée{rejected > 1 ? "s" : ""}</StatusChip>
                        )}
                      </div>
                      {done > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1 bg-surface-sunken rounded-full overflow-hidden flex">
                            <div className="h-full bg-success transition-all" style={{ width: `${(approved / total) * 100}%` }} />
                            <div className="h-full bg-danger transition-all" style={{ width: `${(rejected / total) * 100}%` }} />
                          </div>
                          <span className="text-xs text-ink-subtle shrink-0">{progressPct}%</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1 text-xs text-ink-subtle shrink-0">
                  <span>{total} photo{total !== 1 ? "s" : ""}</span>
                  {event._count.files > 0 && (
                    <span>{event._count.files} fichier{event._count.files > 1 ? "s" : ""}</span>
                  )}
                  <span>par {event.createdBy.displayName || event.createdBy.name || "—"}</span>
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
            events={events.map((e) => ({
              id: e.id,
              name: e.name,
              date: e.date.toISOString(),
              approvedPhotoCount: e.photoCounts.approved,
              totalPhotoCount: e._count.photos,
            }))}
            projects={[]}
            initialEventIds={Array.from(selected)}
            lockedScope="photos"
            onCreated={() => setShareModalOpen(false)}
          />
        </Modal>
      )}
    </div>
  );
}
