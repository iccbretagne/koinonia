"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type JobType = "EMPLOI" | "STAGE" | "ALTERNANCE";

interface Job {
  id: string;
  title: string;
  type: JobType;
  company: string;
  location: string | null;
  description: string;
  duration: string | null;
  deadline: string | null;
  contactEmail: string | null;
  contactUrl: string | null;
  status: "PUBLISHED" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  renewalRequestedAt: string | null;
  author: { id: string; name: string | null; displayName: string | null; image: string | null };
}

const TYPE_LABELS: Record<JobType, string> = {
  EMPLOI:     "Emploi",
  STAGE:      "Stage",
  ALTERNANCE: "Alternance",
};

const TYPE_COLORS: Record<JobType, string> = {
  EMPLOI:     "bg-brand-soft text-brand-text",
  STAGE:      "bg-info-soft text-info",
  ALTERNANCE: "bg-accent-soft text-warning",
};

export default function JobDetailClient({
  job,
  canManage,
  isAuthor,
}: {
  readonly job: Job;
  readonly canManage: boolean;
  readonly isAuthor: boolean;
}) {
  const router = useRouter();
  const [archiving, setArchiving] = useState(false);
  const [deleting,  setDeleting]  = useState(false);
  const [confirming, setConfirming] = useState(false);

  const isArchived = job.status === "ARCHIVED";
  const archiveLabel = isArchived ? "Republier" : "Archiver";
  const canAct = isAuthor || canManage;

  // Une relance est en cours : l'offre sera archivée 14 jours après renewalRequestedAt.
  const renewalDate = job.renewalRequestedAt ? new Date(job.renewalRequestedAt) : null;
  const archiveDate = renewalDate
    ? new Date(renewalDate.getTime() + 14 * 86_400_000)
    : null;
  const showRenewalBanner = !isArchived && canAct && !!archiveDate;

  async function confirmStillActive() {
    setConfirming(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ renew: true }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      router.refresh();
    } finally {
      setConfirming(false);
    }
  }

  async function toggleArchive() {
    setArchiving(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: isArchived ? "PUBLISHED" : "ARCHIVED" }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      router.refresh();
    } finally {
      setArchiving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Supprimer définitivement cette offre ?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      router.push("/jobs");
    } finally {
      setDeleting(false);
    }
  }

  const deadlineDate = job.deadline ? new Date(job.deadline) : null;
  const createdDate  = new Date(job.createdAt);
  const authorName   = job.author.displayName ?? job.author.name ?? "Anonyme";

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Link href="/jobs" className="text-sm text-ink-subtle hover:text-ink-muted">← Toutes les offres</Link>
      </div>

      <div className="bg-surface rounded-lg border border-line p-6">
        {isArchived && (
          <div className="mb-4 px-4 py-2 bg-surface-sunken text-ink-muted text-sm rounded-lg">
            Cette offre est archivée et n&apos;est plus visible dans la liste.
          </div>
        )}

        {showRenewalBanner && (
          <div className="mb-4 px-4 py-3 bg-warning-soft border border-warning/30 text-warning text-sm rounded-lg flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="flex-1">
              Sans confirmation, cette offre sera archivée automatiquement le{" "}
              <strong>{archiveDate!.toLocaleDateString("fr-FR")}</strong>.
            </span>
            <button
              onClick={confirmStillActive}
              disabled={confirming}
              className="shrink-0 px-3 py-1.5 text-xs font-semibold bg-brand text-on-brand rounded-lg hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {confirming ? "…" : "Toujours d'actualité"}
            </button>
          </div>
        )}

        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full mb-2 ${TYPE_COLORS[job.type]}`}>
              {TYPE_LABELS[job.type]}
            </span>
            <h1 className="text-xl font-bold text-ink">{job.title}</h1>
            <p className="text-ink-muted mt-0.5">{job.company}</p>
            {job.location && <p className="text-sm text-ink-subtle mt-0.5">{job.location}</p>}
          </div>

          {(canManage || isAuthor) && (
            <div className="flex gap-2 shrink-0">
              {isAuthor && !isArchived && (
                <Link
                  href={`/jobs/${job.id}/edit`}
                  className="px-3 py-1.5 text-xs font-semibold border border-line rounded-lg hover:bg-surface-sunken transition-colors"
                >
                  Modifier
                </Link>
              )}
              {(canManage || isAuthor) && (
                <button
                  onClick={toggleArchive}
                  disabled={archiving}
                  className="px-3 py-1.5 text-xs font-semibold border border-line rounded-lg hover:bg-surface-sunken disabled:opacity-50 transition-colors"
                >
                  {archiving ? "…" : archiveLabel}
                </button>
              )}
              {(canManage || isAuthor) && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-1.5 text-xs font-semibold border border-danger/30 text-danger rounded-lg hover:bg-danger-soft disabled:opacity-50 transition-colors"
                >
                  {deleting ? "…" : "Supprimer"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-muted mb-5 py-3 border-y border-line">
          {job.duration && <span>Durée : <strong className="text-ink-muted">{job.duration}</strong></span>}
          {deadlineDate && (
            <span>
              Date limite : <strong className="text-ink-muted">{deadlineDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</strong>
            </span>
          )}
          <span>
            Publié par <strong className="text-ink-muted">{authorName}</strong> le {createdDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </span>
        </div>

        {/* Description */}
        <div className="prose prose-sm max-w-none">
          <p className="text-ink-muted whitespace-pre-wrap">{job.description}</p>
        </div>

        {/* Contact */}
        {(job.contactEmail || job.contactUrl) && (
          <div className="mt-6 pt-5 border-t border-line">
            <p className="text-sm font-semibold text-ink-muted mb-2">Candidature</p>
            {job.contactEmail && (
              <a
                href={`mailto:${job.contactEmail}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-on-brand text-sm font-semibold rounded-lg hover:bg-brand-hover transition-colors"
              >
                Envoyer un email →
              </a>
            )}
            {job.contactUrl && (
              <a
                href={job.contactUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-on-brand text-sm font-semibold rounded-lg hover:bg-brand-hover transition-colors"
              >
                Postuler en ligne ↗
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
