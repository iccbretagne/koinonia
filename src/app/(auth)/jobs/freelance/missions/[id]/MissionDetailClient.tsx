"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Mission {
  id: string;
  title: string;
  domain: string;
  duration: string | null;
  dailyRate: string | null;
  hourlyRate: string | null;
  modality: "REMOTE" | "ONSITE" | "HYBRID";
  location: string | null;
  description: string;
  contactEmail: string | null;
  contactUrl: string | null;
  status: "ACTIVE" | "FILLED" | "ARCHIVED";
  createdAt: string;
  author: { id: string; name: string | null; displayName: string | null; image: string | null };
}

const MODALITY_LABEL: Record<string, string> = {
  REMOTE: "Full remote",
  ONSITE: "Présentiel",
  HYBRID: "Hybride",
};

export default function MissionDetailClient({
  mission,
  canManage,
  isAuthor,
}: {
  mission: Mission;
  canManage: boolean;
  isAuthor: boolean;
}) {
  const router  = useRouter();
  const [loading, setLoading] = useState(false);

  const isFilled   = mission.status === "FILLED";
  const isArchived = mission.status === "ARCHIVED";

  async function markFilled() {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/freelance/missions/${mission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "FILLED" }),
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
      const res = await fetch(`/api/jobs/freelance/missions/${mission.id}`, {
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
    if (!confirm("Supprimer définitivement cette mission ?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/freelance/missions/${mission.id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      router.push("/jobs?tab=freelance");
    } finally {
      setLoading(false);
    }
  }

  const authorName = mission.author.displayName ?? mission.author.name ?? "Anonyme";

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Link href="/jobs?tab=freelance" className="text-sm text-gray-400 hover:text-gray-600">
          ← Freelance
        </Link>
      </div>

      <div className="bg-white rounded-lg border-2 border-gray-200 p-6">
        {isFilled && (
          <div className="mb-4 px-4 py-3 bg-green-50 text-green-700 text-sm rounded-lg border border-green-200">
            Mission pourvue — le prestataire a été trouvé.
          </div>
        )}
        {isArchived && (
          <div className="mb-4 px-4 py-2 bg-gray-100 text-gray-500 text-sm rounded-lg">
            Cette mission a été archivée par un modérateur.
          </div>
        )}

        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex flex-wrap gap-2 mb-2">
              <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full font-medium">
                {mission.domain}
              </span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full font-medium">
                {MODALITY_LABEL[mission.modality]}
              </span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">{mission.title}</h1>
            <p className="text-gray-600 mt-0.5">{authorName}</p>
          </div>

          {(canManage || isAuthor) && (
            <div className="flex flex-wrap gap-2 shrink-0">
              {isAuthor && !isFilled && !isArchived && (
                <Link
                  href={`/jobs/freelance/missions/${mission.id}/edit`}
                  className="px-3 py-1.5 text-xs font-semibold border-2 border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Modifier
                </Link>
              )}
              {isAuthor && !isFilled && !isArchived && (
                <button
                  onClick={markFilled}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-semibold border-2 border-green-300 text-green-700 rounded-lg hover:bg-green-50 disabled:opacity-50 transition-colors"
                >
                  {loading ? "…" : "Mission pourvue ✓"}
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

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500 mb-5 py-3 border-y border-gray-100">
          {mission.duration && (
            <span>Durée : <strong className="text-gray-700">{mission.duration}</strong></span>
          )}
          {mission.location && mission.modality !== "REMOTE" && (
            <span>Localisation : <strong className="text-gray-700">{mission.location || "À préciser"}</strong></span>
          )}
          {mission.dailyRate && (
            <span>TJM : <strong className="text-gray-700">{mission.dailyRate}</strong></span>
          )}
          {mission.hourlyRate && (
            <span>Taux horaire : <strong className="text-gray-700">{mission.hourlyRate}</strong></span>
          )}
          <span>
            Publié le{" "}
            <strong className="text-gray-700">
              {new Date(mission.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            </strong>
          </span>
        </div>

        <div className="prose prose-sm max-w-none">
          <p className="text-gray-700 whitespace-pre-wrap">{mission.description}</p>
        </div>

        {(mission.contactEmail || mission.contactUrl) && (
          <div className="mt-6 pt-5 border-t border-gray-100">
            <p className="text-sm font-semibold text-gray-700 mb-3">Contact</p>
            <div className="flex flex-wrap gap-3">
              {mission.contactEmail && (
                <a
                  href={`mailto:${mission.contactEmail}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-icc-violet text-white text-sm font-semibold rounded-lg hover:bg-icc-violet/90 transition-colors"
                >
                  Envoyer un email →
                </a>
              )}
              {mission.contactUrl && (
                <a
                  href={mission.contactUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 border-2 border-icc-violet text-icc-violet text-sm font-semibold rounded-lg hover:bg-icc-violet/5 transition-colors"
                >
                  Voir le lien ↗
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
