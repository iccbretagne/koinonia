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
  readonly profile: FreelanceProfile;
  readonly canManage: boolean;
  readonly isAuthor: boolean;
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
        <Link href="/jobs?tab=freelance" className="text-sm text-ink-subtle hover:text-ink-muted">
          ← Freelance
        </Link>
      </div>

      <div className="bg-surface rounded-lg border border-line p-6">
        {isUnavailable && (
          <div className="mb-4 px-4 py-3 bg-warning-soft text-warning text-sm rounded-lg border border-warning/30">
            Ce freelance n&apos;est plus disponible pour le moment.
          </div>
        )}
        {isArchived && (
          <div className="mb-4 px-4 py-2 bg-surface-sunken text-ink-muted text-sm rounded-lg">
            Ce profil a été archivé par un modérateur.
          </div>
        )}

        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex flex-wrap gap-2 mb-2">
              <span className="text-xs bg-surface-sunken text-ink-muted px-2.5 py-0.5 rounded-full font-medium">
                {profile.domain}
              </span>
              <span className="text-xs bg-info-soft text-info px-2.5 py-0.5 rounded-full font-medium">
                {MODALITY_LABEL[profile.modality]}
              </span>
            </div>
            <h1 className="text-xl font-bold text-ink">{profile.title}</h1>
            <p className="text-ink-muted mt-0.5">{authorName}</p>
          </div>

          {(canManage || isAuthor) && (
            <div className="flex flex-wrap gap-2 shrink-0">
              {isAuthor && !isUnavailable && !isArchived && (
                <Link
                  href={`/jobs/freelance/profiles/${profile.id}/edit`}
                  className="px-3 py-1.5 text-xs font-semibold border border-line rounded-lg hover:bg-surface-sunken transition-colors"
                >
                  Modifier
                </Link>
              )}
              {isAuthor && !isUnavailable && !isArchived && (
                <button
                  onClick={markUnavailable}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-semibold border border-warning/30 text-warning rounded-lg hover:bg-warning-soft disabled:opacity-50 transition-colors"
                >
                  {loading ? "…" : "Plus disponible"}
                </button>
              )}
              {canManage && (
                <button
                  onClick={toggleArchive}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-semibold border border-line rounded-lg hover:bg-surface-sunken disabled:opacity-50 transition-colors"
                >
                  {loading ? "…" : isArchived ? "Republier" : "Archiver"}
                </button>
              )}
              {(canManage || isAuthor) && (
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-semibold border border-danger/30 text-danger rounded-lg hover:bg-danger-soft disabled:opacity-50 transition-colors"
                >
                  {loading ? "…" : "Supprimer"}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-muted mb-5 py-3 border-y border-line">
          {availableDate && (
            <span>
              Disponible le{" "}
              <strong className="text-ink-muted">
                {availableDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              </strong>
            </span>
          )}
          {!availableDate && <span><strong className="text-ink-muted">Disponible dès maintenant</strong></span>}
          {profile.location && profile.modality !== "REMOTE" && (
            <span>Localisation : <strong className="text-ink-muted">{profile.location}</strong></span>
          )}
          {profile.dailyRate && (
            <span>TJM : <strong className="text-ink-muted">{profile.dailyRate}</strong></span>
          )}
          {profile.hourlyRate && (
            <span>Taux horaire : <strong className="text-ink-muted">{profile.hourlyRate}</strong></span>
          )}
          <span>
            Publié le{" "}
            <strong className="text-ink-muted">
              {new Date(profile.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            </strong>
          </span>
        </div>

        <div className="prose prose-sm max-w-none">
          <p className="text-ink-muted whitespace-pre-wrap">{profile.description}</p>
        </div>

        {(profile.contactEmail || profile.contactUrl) && (
          <div className="mt-6 pt-5 border-t border-line">
            <p className="text-sm font-semibold text-ink-muted mb-3">Contact</p>
            <div className="flex flex-wrap gap-3">
              {profile.contactEmail && (
                <a
                  href={`mailto:${profile.contactEmail}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-on-brand text-sm font-semibold rounded-lg hover:bg-brand-hover transition-colors"
                >
                  Envoyer un email →
                </a>
              )}
              {profile.contactUrl && (
                <a
                  href={profile.contactUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 border border-brand text-brand-text text-sm font-semibold rounded-lg hover:bg-brand-soft transition-colors"
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
