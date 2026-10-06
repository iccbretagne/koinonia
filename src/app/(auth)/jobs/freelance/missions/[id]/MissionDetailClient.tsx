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
  readonly mission: Mission;
  readonly canManage: boolean;
  readonly isAuthor: boolean;
}) {
  const router  = useRouter();
  const [loading, setLoading] = useState(false);

  const isFilled   = mission.status === "FILLED";
  const isArchived = mission.status === "ARCHIVED";
  const toggleLabel = isArchived ? "Republier" : "Archiver";

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
        <Link href="/jobs?tab=freelance" className="text-sm text-ink-subtle hover:text-ink-muted">
          ← Freelance
        </Link>
      </div>

      <div className="bg-surface rounded-lg border border-line p-6">
        {isFilled && (
          <div className="mb-4 px-4 py-3 bg-success-soft text-success text-sm rounded-lg border border-success/30">
            Mission pourvue — le prestataire a été trouvé.
          </div>
        )}
        {isArchived && (
          <div className="mb-4 px-4 py-2 bg-surface-sunken text-ink-muted text-sm rounded-lg">
            Cette mission a été archivée par un modérateur.
          </div>
        )}

        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex flex-wrap gap-2 mb-2">
              <span className="text-xs bg-surface-sunken text-ink-muted px-2.5 py-0.5 rounded-full font-medium">
                {mission.domain}
              </span>
              <span className="text-xs bg-info-soft text-info px-2.5 py-0.5 rounded-full font-medium">
                {MODALITY_LABEL[mission.modality]}
              </span>
            </div>
            <h1 className="text-xl font-bold text-ink">{mission.title}</h1>
            <p className="text-ink-muted mt-0.5">{authorName}</p>
          </div>

          {(canManage || isAuthor) && (
            <div className="flex flex-wrap gap-2 shrink-0">
              {isAuthor && !isFilled && !isArchived && (
                <Link
                  href={`/jobs/freelance/missions/${mission.id}/edit`}
                  className="px-3 py-1.5 text-xs font-semibold border border-line rounded-lg hover:bg-surface-sunken transition-colors"
                >
                  Modifier
                </Link>
              )}
              {isAuthor && !isFilled && !isArchived && (
                <button
                  onClick={markFilled}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-semibold border border-success/30 text-success rounded-lg hover:bg-success-soft disabled:opacity-50 transition-colors"
                >
                  {loading ? "…" : "Mission pourvue ✓"}
                </button>
              )}
              {canManage && (
                <button
                  onClick={toggleArchive}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-semibold border border-line rounded-lg hover:bg-surface-sunken disabled:opacity-50 transition-colors"
                >
                  {loading ? "…" : toggleLabel}
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
          {mission.duration && (
            <span>Durée : <strong className="text-ink-muted">{mission.duration}</strong></span>
          )}
          {mission.location && mission.modality !== "REMOTE" && (
            <span>Localisation : <strong className="text-ink-muted">{mission.location || "À préciser"}</strong></span>
          )}
          {mission.dailyRate && (
            <span>TJM : <strong className="text-ink-muted">{mission.dailyRate}</strong></span>
          )}
          {mission.hourlyRate && (
            <span>Taux horaire : <strong className="text-ink-muted">{mission.hourlyRate}</strong></span>
          )}
          <span>
            Publié le{" "}
            <strong className="text-ink-muted">
              {new Date(mission.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            </strong>
          </span>
        </div>

        <div className="prose prose-sm max-w-none">
          <p className="text-ink-muted whitespace-pre-wrap">{mission.description}</p>
        </div>

        {(mission.contactEmail || mission.contactUrl) && (
          <div className="mt-6 pt-5 border-t border-line">
            <p className="text-sm font-semibold text-ink-muted mb-3">Contact</p>
            <div className="flex flex-wrap gap-3">
              {mission.contactEmail && (
                <a
                  href={`mailto:${mission.contactEmail}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-on-brand text-sm font-semibold rounded-lg hover:bg-brand-hover transition-colors"
                >
                  Envoyer un email →
                </a>
              )}
              {mission.contactUrl && (
                <a
                  href={mission.contactUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 border border-brand text-brand-text text-sm font-semibold rounded-lg hover:bg-brand-soft transition-colors"
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
