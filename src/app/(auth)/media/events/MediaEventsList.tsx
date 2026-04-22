"use client";

import Link from "next/link";
import { useState } from "react";
import type { MediaEventStatus } from "@/generated/prisma/enums";

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
  DRAFT: "bg-gray-100 text-gray-700",
  PENDING_REVIEW: "bg-yellow-100 text-yellow-800",
  REVIEWED: "bg-green-100 text-green-800",
  ARCHIVED: "bg-gray-100 text-gray-500",
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
}: {
  events: MediaEvent[];
  canUpload: boolean;
}) {
  const [statusFilter, setStatusFilter] = useState<MediaEventStatus | "">("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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
            className="border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent flex-1"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as MediaEventStatus | "")}
            className="border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
          >
            <option value="">Tous les statuts</option>
            {(Object.keys(STATUS_LABELS) as MediaEventStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
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
          {events.length === 0 ? (
            <>
              <p className="text-lg font-medium mb-2">Aucun événement média</p>
              {canUpload && (
                <p className="text-sm">
                  <Link href="/media/events/new" className="text-icc-violet hover:underline">
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
              className={`block bg-white rounded-xl border-2 p-4 hover:border-icc-violet transition-colors ${
                hasActivity ? "border-amber-200" : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="font-semibold text-gray-900 truncate">{event.name}</h2>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[event.status]}`}>
                      {STATUS_LABELS[event.status]}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">{formatDate(event.date)}</p>
                  {event.planningEvent && (
                    <p className="text-xs text-icc-violet mt-1">Lié à : {event.planningEvent.title}</p>
                  )}
                  {event.description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-1">{event.description}</p>
                  )}

                  {/* Indicateurs de statut photos */}
                  {total > 0 && (
                    <div className="mt-2.5 space-y-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        {pending > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-yellow-50 text-yellow-800 border border-yellow-200 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
                            {pending} en attente
                          </span>
                        )}
                        {prevalidated > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                            {prevalidated} pré-validée{prevalidated > 1 ? "s" : ""}
                          </span>
                        )}
                        {approved > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                            {approved} approuvée{approved > 1 ? "s" : ""}
                          </span>
                        )}
                        {rejected > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                            {rejected} rejetée{rejected > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      {done > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden flex">
                            <div className="h-full bg-green-400 transition-all" style={{ width: `${(approved / total) * 100}%` }} />
                            <div className="h-full bg-red-300 transition-all" style={{ width: `${(rejected / total) * 100}%` }} />
                          </div>
                          <span className="text-xs text-gray-400 shrink-0">{progressPct}%</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1 text-xs text-gray-400 shrink-0">
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
    </div>
  );
}
