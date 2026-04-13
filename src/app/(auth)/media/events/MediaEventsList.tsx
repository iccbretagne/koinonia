"use client";

import Link from "next/link";
import { useState } from "react";
import type { MediaEventStatus } from "@/generated/prisma/enums";

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

  const filtered = events.filter((e) => {
    if (statusFilter && e.status !== statusFilter) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
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

      <div className="grid gap-4">
        {filtered.map((event) => (
          <Link
            key={event.id}
            href={`/media/events/${event.id}`}
            className="block bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-icc-violet transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h2 className="font-semibold text-gray-900 truncate">{event.name}</h2>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[event.status]}`}>
                    {STATUS_LABELS[event.status]}
                  </span>
                </div>
                <p className="text-sm text-gray-500">{formatDate(event.date)}</p>
                {event.planningEvent && (
                  <p className="text-xs text-icc-violet mt-1">
                    Lié à : {event.planningEvent.title}
                  </p>
                )}
                {event.description && (
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">{event.description}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 text-xs text-gray-500 shrink-0">
                {event._count.photos > 0 && (
                  <span>{event._count.photos} photo{event._count.photos > 1 ? "s" : ""}</span>
                )}
                {event._count.files > 0 && (
                  <span>{event._count.files} fichier{event._count.files > 1 ? "s" : ""}</span>
                )}
                <span className="text-gray-400">
                  par {event.createdBy.displayName || event.createdBy.name || "—"}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
