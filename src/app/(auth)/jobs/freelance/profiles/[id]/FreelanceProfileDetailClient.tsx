"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface FreelanceProfile {
  id: string;
  title: string;
  domain: string;
  dailyRate: string | null;
  hourlyRate: string | null;
  modality: "REMOTE" | "ONSITE" | "HYBRID";
  location: string | null;
  availableFrom: string | null;
  description: string;
  contactEmail: string | null;
  contactUrl: string | null;
  status: "ACTIVE" | "UNAVAILABLE" | "ARCHIVED";
  createdAt: string;
  author: { id: string; name: string | null; displayName: string | null; image: string | null };
}

const MODALITY_LABEL: Record<string, string> = {
  REMOTE: "Full remote",
  ONSITE: "Présentiel",
  HYBRID: "Hybride",
};

export default function FreelanceProfileDetailClient({
  profile,
  canManage,
  isAuthor,
}: {
  profile: FreelanceProfile;
  canManage: boolean;
  isAuthor: boolean;
}) {
  const router  = useRouter();
  const [loading, setLoading] = useState(false);

  const isUnavailable = profile.status === "UNAVAILABLE";
  const isArchived    = profile.status === "ARCHIVED";

  async function markUnavailable() {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/freelance/profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "UNAVAILABLE" }),
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
      const res = await fetch(`/api/jobs/freelance/profiles/${profile.id}`, {
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
    if (!confirm("Supprimer définitivement ce profil freelance ?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/freelance/profiles/${profile.id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      router.push("/jobs?tab=freelance");
    } finally {
      setLoading(false);
    }
  }

  const authorName    = profile.author.displayName ?? profile.author.name ?? "Anonyme";
  const availableDate = profile.availableFrom ? new Date(profile.availableFrom) : null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Link href="/jobs?tab=freelance" className="text-sm text-gray-400 hover:text-gray-600">
          ← Freelance
        </Link>
      </div>

      <div className="bg-white rounded-lg border-2 border-gray-200 p-6">
        {isUnavailable && (
          <div className="mb-4 px-4 py-3 bg-yellow-50 text-yellow-700 text-sm rounded-lg border border-yellow-200">
            Ce freelance n&apos;est plus disponible pour le moment.
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
              <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full font-medium">
                {profile.domain}
              </span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full font-medium">
                {MODALITY_LABEL[profile.modality]}
              </span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">{profile.title}</h1>
            <p className="text-gray-600 mt-0.5">{authorName}</p>
          </div>

          {(canManage || isAuthor) && (
            <div className="flex flex-wrap gap-2 shrink-0">
              {isAuthor && !isUnavailable && !isArchived && (
                <Link
                  href={`/jobs/freelance/profiles/${profile.id}/edit`}
                  className="px-3 py-1.5 text-xs font-semibold border-2 border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Modifier
                </Link>
              )}
              {isAuthor && !isUnavailable && !isArchived && (
                <button
                  onClick={markUnavailable}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-semibold border-2 border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 disabled:opacity-50 transition-colors"
                >
                  {loading ? "…" : "Plus disponible"}
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
          {availableDate && (
            <span>
              Disponible le{" "}
              <strong className="text-gray-700">
                {availableDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              </strong>
            </span>
          )}
          {!availableDate && <span><strong className="text-gray-700">Disponible dès maintenant</strong></span>}
          {profile.location && profile.modality !== "REMOTE" && (
            <span>Localisation : <strong className="text-gray-700">{profile.location}</strong></span>
          )}
          {profile.dailyRate && (
            <span>TJM : <strong className="text-gray-700">{profile.dailyRate}</strong></span>
          )}
          {profile.hourlyRate && (
            <span>Taux horaire : <strong className="text-gray-700">{profile.hourlyRate}</strong></span>
          )}
          <span>
            Publié le{" "}
            <strong className="text-gray-700">
              {new Date(profile.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            </strong>
          </span>
        </div>

        <div className="prose prose-sm max-w-none">
          <p className="text-gray-700 whitespace-pre-wrap">{profile.description}</p>
        </div>

        {(profile.contactEmail || profile.contactUrl) && (
          <div className="mt-6 pt-5 border-t border-gray-100">
            <p className="text-sm font-semibold text-gray-700 mb-3">Contact</p>
            <div className="flex flex-wrap gap-3">
              {profile.contactEmail && (
                <a
                  href={`mailto:${profile.contactEmail}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-icc-violet text-white text-sm font-semibold rounded-lg hover:bg-icc-violet/90 transition-colors"
                >
                  Envoyer un email →
                </a>
              )}
              {profile.contactUrl && (
                <a
                  href={profile.contactUrl}
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
