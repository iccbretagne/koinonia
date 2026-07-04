"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  contactEmail: string | null;
  contactUrl: string | null;
  status: "ACTIVE" | "FOUND" | "ARCHIVED";
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

export default function SeekerDetailClient({
  seeker,
  canManage,
  isAuthor,
}: {
  seeker: Seeker;
  canManage: boolean;
  isAuthor: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const isFound    = seeker.status === "FOUND";
  const isArchived = seeker.status === "ARCHIVED";

  const contractBadges = (
    [
      seeker.wantEmploi     && "EMPLOI",
      seeker.wantStage      && "STAGE",
      seeker.wantAlternance && "ALTERNANCE",
    ] as (ContractType | false)[]
  ).filter(Boolean) as ContractType[];

  async function markFound() {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/seekers/${seeker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "FOUND" }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function toggleArchive() {
    setLoading(true);
    try {
      const newStatus = isArchived ? "ACTIVE" : "ARCHIVED";
      const res = await fetch(`/api/jobs/seekers/${seeker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Supprimer définitivement ce profil ?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/seekers/${seeker.id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      router.push("/jobs?tab=seekers");
    } finally {
      setLoading(false);
    }
  }

  const authorName   = seeker.author.displayName ?? seeker.author.name ?? "Anonyme";
  const createdDate  = new Date(seeker.createdAt);
  const availableDate = seeker.availableFrom ? new Date(seeker.availableFrom) : null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Link href="/jobs?tab=seekers" className="text-sm text-gray-400 hover:text-gray-600">
          ← Tous les profils
        </Link>
      </div>

      <div className="bg-white rounded-lg border-2 border-gray-200 p-6">
        {isFound && (
          <div className="mb-4 px-4 py-3 bg-green-50 text-green-700 text-sm rounded-lg border border-green-200">
            Ce profil est clôturé — emploi trouvé ! 🎉
          </div>
        )}
        {isArchived && (
          <div className="mb-4 px-4 py-2 bg-gray-100 text-gray-500 text-sm rounded-lg">
            Ce profil a été archivé par un modérateur.
          </div>
        )}

        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex flex-wrap gap-2 mb-2">
              {contractBadges.map((type) => (
                <span key={type} className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${TYPE_COLORS[type]}`}>
                  {TYPE_LABELS[type]}
                </span>
              ))}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{seeker.title}</h1>
            <p className="text-gray-600 mt-0.5">{authorName}</p>
          </div>

          {(canManage || isAuthor) && (
            <div className="flex flex-wrap gap-2 shrink-0">
              {isAuthor && !isFound && !isArchived && (
                <Link
                  href={`/jobs/seekers/${seeker.id}/edit`}
                  className="px-3 py-1.5 text-xs font-semibold border-2 border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Modifier
                </Link>
              )}
              {isAuthor && !isFound && !isArchived && (
                <button
                  onClick={markFound}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-semibold border-2 border-green-300 text-green-700 rounded-lg hover:bg-green-50 disabled:opacity-50 transition-colors"
                >
                  {loading ? "…" : "J'ai trouvé ! 🎉"}
                </button>
              )}
              {canManage && (
                <button
                  onClick={toggleArchive}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-semibold border-2 border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {loading ? "…" : isArchived ? "Republier" : "Archiver"}
                </button>
              )}
              {(canManage || isAuthor) && (
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-semibold border-2 border-icc-rouge/30 text-icc-rouge rounded-lg hover:bg-icc-rouge/5 disabled:opacity-50 transition-colors"
                >
                  {loading ? "…" : "Supprimer"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Métadonnées */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500 mb-5 py-3 border-y border-gray-100">
          {seeker.sector && (
            <span>Secteur : <strong className="text-gray-700">{seeker.sector}</strong></span>
          )}
          {seeker.location && (
            <span>
              Localisation : <strong className="text-gray-700">{seeker.location}{seeker.remote ? " · télétravail" : ""}</strong>
            </span>
          )}
          {!seeker.location && seeker.remote && (
            <span><strong className="text-gray-700">Télétravail</strong></span>
          )}
          {availableDate && (
            <span>
              Disponible le : <strong className="text-gray-700">{availableDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</strong>
            </span>
          )}
          <span>
            Publié par <strong className="text-gray-700">{authorName}</strong> le {createdDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </span>
        </div>

        {/* Description */}
        <div className="prose prose-sm max-w-none">
          <p className="text-gray-700 whitespace-pre-wrap">{seeker.description}</p>
        </div>

        {/* Contact */}
        {(seeker.contactEmail || seeker.contactUrl) && (
          <div className="mt-6 pt-5 border-t border-gray-100">
            <p className="text-sm font-semibold text-gray-700 mb-3">Contact</p>
            <div className="flex flex-wrap gap-3">
              {seeker.contactEmail && (
                <a
                  href={`mailto:${seeker.contactEmail}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-icc-violet text-white text-sm font-semibold rounded-lg hover:bg-icc-violet/90 transition-colors"
                >
                  Envoyer un email →
                </a>
              )}
              {seeker.contactUrl && (
                <a
                  href={seeker.contactUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 border-2 border-icc-violet text-icc-violet text-sm font-semibold rounded-lg hover:bg-icc-violet/5 transition-colors"
                >
                  Voir le profil ↗
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
