"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { changeJobStatus } from "./job-status";

type ContractType = "EMPLOI" | "STAGE" | "ALTERNANCE";
type SeekerStatus = "ACTIVE" | "FOUND" | "ARCHIVED";

interface Seeker {
  id: string;
  title: string;
  wantEmploi: boolean;
  wantStage: boolean;
  wantAlternance: boolean;
  sector: string | null;
  location: string | null;
  remote: boolean;
  availableFrom: string | null;
  description: string;
  status: string;
  createdAt: string;
  author: { id: string; name: string | null; displayName: string | null; image: string | null };
}

const TYPE_LABELS: Record<ContractType, string> = {
  EMPLOI:     "Emploi",
  STAGE:      "Stage",
  ALTERNANCE: "Alternance",
};

const TYPE_COLORS: Record<ContractType, string> = {
  EMPLOI:     "bg-brand-soft text-brand-text",
  STAGE:      "bg-info-soft text-info",
  ALTERNANCE: "bg-accent-soft text-warning",
};

const STATUS_FILTER_LABELS: Record<"ALL" | SeekerStatus, string> = {
  ALL:      "Tout",
  ACTIVE:   "En recherche",
  FOUND:    "A trouvé",
  ARCHIVED: "Archivé",
};

export default function SeekersListClient({
  seekers,
  currentUserId,
  canManage = false,
}: {
  readonly seekers: Seeker[];
  readonly currentUserId: string;
  readonly canManage?: boolean;
}) {
  const [activeFilters, setActiveFilters] = useState<Set<ContractType>>(new Set());
  const [statusFilter, setStatusFilter] = useState<"ALL" | SeekerStatus>("ACTIVE");

  function toggleFilter(type: ContractType) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }

  const filtered = seekers.filter(
    (s) =>
      (activeFilters.size === 0 ||
        (activeFilters.has("EMPLOI")     && s.wantEmploi)     ||
        (activeFilters.has("STAGE")      && s.wantStage)      ||
        (activeFilters.has("ALTERNANCE") && s.wantAlternance)) &&
      (!canManage || statusFilter === "ALL" || s.status === statusFilter)
  );

  return (
    <div>
      {/* Filtres */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(["EMPLOI", "STAGE", "ALTERNANCE"] as const).map((type) => (
          <button
            key={type}
            onClick={() => toggleFilter(type)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full border-2 transition-colors ${
              activeFilters.has(type)
                ? TYPE_COLORS[type] + " border-current"
                : "border-line text-ink-muted hover:border-control-line"
            }`}
          >
            {TYPE_LABELS[type]}
          </button>
        ))}
        {activeFilters.size > 0 && (
          <button
            onClick={() => setActiveFilters(new Set())}
            className="px-3 py-1.5 text-xs text-ink-subtle hover:text-ink-muted transition-colors"
          >
            Effacer
          </button>
        )}
      </div>

      {canManage && (
        <div className="flex gap-1 mb-6">
          {(["ALL", "ACTIVE", "FOUND", "ARCHIVED"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 text-xs font-semibold rounded-full border-2 transition-colors ${
                statusFilter === s
                  ? "border-brand text-brand-text bg-brand-soft"
                  : "border-line text-ink-muted hover:bg-surface-sunken"
              }`}
            >
              {STATUS_FILTER_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-ink-subtle">
          <p className="text-lg font-medium">
            {seekers.length === 0 ? "Aucun profil de recherche pour le moment" : "Aucun profil ne correspond au filtre"}
          </p>
          {seekers.length === 0 && (
            <>
              <p className="text-sm mt-1">Soyez le premier à publier votre recherche !</p>
              <Link
                href="/jobs/seekers/new"
                className="inline-block mt-4 px-4 py-2 bg-brand text-on-brand text-sm font-semibold rounded-lg hover:bg-brand-hover transition-colors"
              >
                Publier mon profil
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((seeker) => (
            <SeekerCard
              key={seeker.id}
              seeker={seeker}
              isOwn={seeker.author.id === currentUserId}
              canManage={canManage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SeekerCard({
  seeker,
  isOwn,
  canManage,
}: {
  readonly seeker: Seeker;
  readonly isOwn: boolean;
  readonly canManage: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const createdDate     = new Date(seeker.createdAt);
  const availableDate   = seeker.availableFrom ? new Date(seeker.availableFrom) : null;
  const authorName      = seeker.author.displayName ?? seeker.author.name ?? "Anonyme";
  const isArchived      = seeker.status === "ARCHIVED";
  let toggleLabel = "Retirer";
  if (loading) toggleLabel = "…";
  else if (isArchived) toggleLabel = "Republier";

  async function toggleStatus(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await changeJobStatus(`/api/jobs/seekers/${seeker.id}`, isArchived ? "ACTIVE" : "ARCHIVED", { setLoading, refresh: () => router.refresh() });
  }

  const contractBadges = (
    [
      seeker.wantEmploi     && "EMPLOI",
      seeker.wantStage      && "STAGE",
      seeker.wantAlternance && "ALTERNANCE",
    ] as (ContractType | false)[]
  ).filter(Boolean) as ContractType[];

  return (
    <Link
      href={`/jobs/seekers/${seeker.id}`}
      className={`block bg-surface rounded-lg border-2 p-5 hover:border-brand/30 hover:shadow-card transition-all ${isArchived ? "border-line opacity-60" : "border-line"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {contractBadges.map((type) => (
              <span key={type} className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${TYPE_COLORS[type]}`}>
                {TYPE_LABELS[type]}
              </span>
            ))}
            {isOwn && (
              <span className="text-xs text-ink-subtle bg-surface-sunken px-2 py-0.5 rounded-full">Mon profil</span>
            )}
            {canManage && seeker.status !== "ACTIVE" && (
              <span className="text-xs bg-surface-sunken text-ink-muted px-2 py-0.5 rounded-full">
                {STATUS_FILTER_LABELS[seeker.status as SeekerStatus] ?? seeker.status}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-ink text-base leading-snug">{seeker.title}</h3>
          <p className="text-sm text-ink-muted mt-0.5">{authorName}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
            {seeker.location && (
              <p className="text-xs text-ink-subtle">{seeker.location}{seeker.remote ? " · télétravail" : ""}</p>
            )}
            {!seeker.location && seeker.remote && (
              <p className="text-xs text-ink-subtle">Télétravail</p>
            )}
            {seeker.sector && (
              <p className="text-xs text-ink-subtle">{seeker.sector}</p>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-ink-subtle">
            {createdDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </p>
          {availableDate && (
            <p className="text-xs text-ink-subtle mt-0.5">
              Dispo le {availableDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
            </p>
          )}
        </div>
      </div>
      <p className="text-sm text-ink-muted mt-2 line-clamp-2">{seeker.description}</p>
      {canManage && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={toggleStatus}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold border border-line rounded-lg hover:bg-surface-sunken disabled:opacity-50 transition-colors"
          >
            {toggleLabel}
          </button>
        </div>
      )}
    </Link>
  );
}
