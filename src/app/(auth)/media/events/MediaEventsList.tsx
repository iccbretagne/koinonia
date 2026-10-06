"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { MediaEventStatus } from "@/generated/prisma/enums";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import CollectionBuilder from "../collections/CollectionBuilder";

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

const STATUS_COLORS: Record<MediaEventStatus, string> = {
  DRAFT: "bg-surface-sunken text-ink-muted",
  PENDING_REVIEW: "bg-warning-soft text-warning",
  REVIEWED: "bg-success-soft text-success",
  ARCHIVED: "bg-surface-sunken text-ink-muted",
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
  const id = useId();
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
          <input
            type="text"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-control-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent flex-1"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as MediaEventStatus | "")}
            className="border border-control-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent"
          >
            <option value="">Tous les statuts</option>
            {(Object.keys(STATUS_LABELS) as MediaEventStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2">
          <div className="flex items-center gap-2 flex-1">
            <label htmlFor={`${id}-f1`} className="text-xs text-ink-muted shrink-0">Du</label>
            <input id={`${id}-f1`}
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="flex-1 border border-control-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2 flex-1">
            <label htmlFor={`${id}-f2`} className="text-xs text-ink-muted shrink-0">au</label>
            <input id={`${id}-f2`}
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 border border-control-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent"
            />
          </div>
          {hasDateFilter && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-xs text-ink-subtle hover:text-brand-text transition-colors shrink-0 px-2 py-1"
            >
              Effacer dates
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-ink-muted">
          {events.length === 0 ? (
            <>
              <p className="text-lg font-medium mb-2">Aucun événement média</p>
              {canUpload && (
                <p className="text-sm">
                  <Link href="/media/events/new" className="text-brand-text hover:underline">
                    Créer le premier événement
                  </Link>
                </p>
              )}
            </>
          ) : (
            <p>Aucun événement ne correspond aux filtres.</p>
          )}
        </div>
      )}

      {canShare && selected.size > 0 && (
        <div className="sticky top-0 z-10 bg-brand-soft border border-brand/30 rounded-lg px-4 py-2 flex items-center justify-between gap-3">
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
              href={`/media/events/${event.id}`}
              className={`block bg-surface rounded-xl border p-4 hover:border-brand transition-colors ${
                hasActivity ? "border-warning/30" : "border-line"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                {canShare && (
                  <input
                    type="checkbox"
                    checked={selected.has(event.id)}
                    onClick={(e) => toggleSelected(event.id, e)}
                    onChange={() => {}}
                    className="w-4 h-4 rounded border-control-line accent-brand shrink-0 mt-1"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="font-semibold text-ink truncate">{event.name}</h2>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[event.status]}`}>
                      {STATUS_LABELS[event.status]}
                    </span>
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
                          <span className="inline-flex items-center gap-1 text-xs bg-warning-soft text-warning border border-warning/30 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
                            {pending} en attente
                          </span>
                        )}
                        {prevalidated > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-info-soft text-info border border-info/30 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-info shrink-0" />
                            {prevalidated} pré-validée{prevalidated > 1 ? "s" : ""}
                          </span>
                        )}
                        {approved > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-success-soft text-success border border-success/30 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                            {approved} approuvée{approved > 1 ? "s" : ""}
                          </span>
                        )}
                        {rejected > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-danger-soft text-danger border border-danger/30 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-danger shrink-0" />
                            {rejected} rejetée{rejected > 1 ? "s" : ""}
                          </span>
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
