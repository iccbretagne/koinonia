"use client";

import { useState } from "react";
import Link from "next/link";

type ContractType = "EMPLOI" | "STAGE" | "ALTERNANCE";

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
  EMPLOI:     "bg-icc-violet/10 text-icc-violet",
  STAGE:      "bg-icc-bleu/10 text-icc-bleu",
  ALTERNANCE: "bg-icc-jaune/20 text-amber-700",
};

export default function SeekersListClient({
  seekers,
  currentUserId,
}: {
  seekers: Seeker[];
  currentUserId: string;
}) {
  const [activeFilters, setActiveFilters] = useState<Set<ContractType>>(new Set());

  function toggleFilter(type: ContractType) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }

  const filtered =
    activeFilters.size === 0
      ? seekers
      : seekers.filter((s) =>
          (activeFilters.has("EMPLOI")     && s.wantEmploi)     ||
          (activeFilters.has("STAGE")      && s.wantStage)      ||
          (activeFilters.has("ALTERNANCE") && s.wantAlternance)
        );

  return (
    <div>
      {/* Filtres */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(["EMPLOI", "STAGE", "ALTERNANCE"] as const).map((type) => (
          <button
            key={type}
            onClick={() => toggleFilter(type)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full border-2 transition-colors ${
              activeFilters.has(type)
                ? TYPE_COLORS[type] + " border-current"
                : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            {TYPE_LABELS[type]}
          </button>
        ))}
        {activeFilters.size > 0 && (
          <button
            onClick={() => setActiveFilters(new Set())}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Effacer
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">
            {seekers.length === 0 ? "Aucun profil de recherche pour le moment" : "Aucun profil ne correspond au filtre"}
          </p>
          {seekers.length === 0 && (
            <>
              <p className="text-sm mt-1">Soyez le premier à publier votre recherche !</p>
              <Link
                href="/jobs/seekers/new"
                className="inline-block mt-4 px-4 py-2 bg-icc-violet text-white text-sm font-semibold rounded-lg hover:bg-icc-violet/90 transition-colors"
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SeekerCard({ seeker, isOwn }: { seeker: Seeker; isOwn: boolean }) {
  const createdDate     = new Date(seeker.createdAt);
  const availableDate   = seeker.availableFrom ? new Date(seeker.availableFrom) : null;
  const authorName      = seeker.author.displayName ?? seeker.author.name ?? "Anonyme";

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
      className="block bg-white rounded-lg border-2 border-gray-100 p-5 hover:border-icc-violet/30 hover:shadow-sm transition-all"
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
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Mon profil</span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 text-base leading-snug">{seeker.title}</h3>
          <p className="text-sm text-gray-600 mt-0.5">{authorName}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
            {seeker.location && (
              <p className="text-xs text-gray-400">{seeker.location}{seeker.remote ? " · télétravail" : ""}</p>
            )}
            {!seeker.location && seeker.remote && (
              <p className="text-xs text-gray-400">Télétravail</p>
            )}
            {seeker.sector && (
              <p className="text-xs text-gray-400">{seeker.sector}</p>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-gray-400">
            {createdDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </p>
          {availableDate && (
            <p className="text-xs text-gray-400 mt-0.5">
              Dispo le {availableDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
            </p>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-500 mt-2 line-clamp-2">{seeker.description}</p>
    </Link>
  );
}
