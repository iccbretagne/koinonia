"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { buildWhatsAppRecap } from "./whatsapp-recap";

type JobType = "EMPLOI" | "STAGE" | "ALTERNANCE";
type JobStatus = "PUBLISHED" | "ARCHIVED";

interface Job {
  id: string;
  title: string;
  type: JobType;
  company: string;
  location: string | null;
  duration: string | null;
  deadline: string | null;
  description: string;
  contactEmail: string | null;
  contactUrl: string | null;
  status: string;
  createdAt: string;
  author: { id: string; name: string | null; displayName: string | null; image: string | null };
}

const STATUS_FILTER_LABELS: Record<"ALL" | JobStatus, string> = {
  ALL:       "Tout",
  PUBLISHED: "Publiées",
  ARCHIVED:  "Retirées",
};

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

export default function JobsListClient({
  jobs,
  currentUserId,
  nowMs,
  canManage = false,
}: {
  readonly jobs: Job[];
  readonly currentUserId: string;
  readonly nowMs: number;
  readonly canManage?: boolean;
}) {
  const [filter, setFilter] = useState<JobType | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | JobStatus>("PUBLISHED");
  const [copied, setCopied] = useState(false);
  const [fallbackText, setFallbackText] = useState<string | null>(null);

  const filtered = jobs.filter(
    (j) =>
      (filter === "ALL" || j.type === filter) &&
      (!canManage || statusFilter === "ALL" || j.status === statusFilter)
  );

  async function copyRecap() {
    const text = buildWhatsAppRecap(filtered, filter, window.location.origin);
    try {
      // En contexte non sécurisé, `navigator.clipboard` est `undefined` : un
      // `?.writeText()` renverrait `undefined` sans lever, et « Copié ! »
      // s'afficherait à tort. La garde explicite fait basculer vers le repli.
      if (!navigator.clipboard) throw new Error("presse-papier indisponible");
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setFallbackText(text);
    }
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6 border-b border-line">
        <div className="flex gap-1 overflow-x-auto">
          {(["ALL", "EMPLOI", "STAGE", "ALTERNANCE"] as const).map((t) => {
            const count = t === "ALL" ? jobs.length : jobs.filter((j) => j.type === t).length;
            return (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  filter === t
                    ? "border-brand text-brand-text"
                    : "border-transparent text-ink-muted hover:text-ink-muted"
                }`}
              >
                {t === "ALL" ? "Tout" : TYPE_LABELS[t]}
                <span className="ml-1.5 text-xs text-ink-subtle">({count})</span>
              </button>
            );
          })}
        </div>
        {filtered.length > 0 && (
          <button
            onClick={copyRecap}
            className="self-start shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 mb-1 rounded-lg border border-brand/30 text-brand-text hover:bg-brand-soft transition-colors font-medium"
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Copié ! ({filtered.length} offre{filtered.length > 1 ? "s" : ""})
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copier pour WhatsApp
              </>
            )}
          </button>
        )}
      </div>

      {canManage && (
        <div className="flex gap-1 mb-4 -mt-2">
          {(["ALL", "PUBLISHED", "ARCHIVED"] as const).map((s) => (
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

      <Modal
        open={!!fallbackText}
        onClose={() => setFallbackText(null)}
        title="Copier le message"
      >
        <p className="text-sm text-ink-muted mb-3">
          La copie automatique n&apos;a pas fonctionné. Sélectionnez le texte ci-dessous et
          copiez-le manuellement.
        </p>
        <textarea
          readOnly
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          value={fallbackText ?? ""}
          rows={12}
          className="w-full text-xs font-mono border border-line rounded-lg p-2 focus:ring-focus focus:border-brand"
        />
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={() => setFallbackText(null)}>
            Fermer
          </Button>
        </div>
      </Modal>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-ink-subtle">
          <p className="text-lg font-medium">Aucune offre pour le moment</p>
          <p className="text-sm mt-1">Soyez le premier à publier !</p>
          <Link href="/jobs/new" className="inline-block mt-4 px-4 py-2 bg-brand text-on-brand text-sm font-semibold rounded-lg hover:bg-brand-hover transition-colors">
            Publier une offre
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              isOwn={job.author.id === currentUserId}
              nowMs={nowMs}
              canManage={canManage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({
  job,
  isOwn,
  nowMs,
  canManage,
}: {
  readonly job: Job;
  readonly isOwn: boolean;
  readonly nowMs: number;
  readonly canManage: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const deadlineDate = job.deadline ? new Date(job.deadline) : null;
  const createdDate  = new Date(job.createdAt);
  const isArchived = job.status === "ARCHIVED";
  const isExpiringSoon = deadlineDate
    ? deadlineDate.getTime() - nowMs < 7 * 24 * 60 * 60 * 1000
    : false;

  async function toggleStatus(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      const newStatus = isArchived ? "PUBLISHED" : "ARCHIVED";
      const res = await fetch(`/api/jobs/${job.id}`, {
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

  return (
    <Link
      href={`/jobs/${job.id}`}
      className={`block bg-surface rounded-lg border-2 p-5 hover:border-brand/30 hover:shadow-card transition-all ${isArchived ? "border-line opacity-60" : "border-line"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${TYPE_COLORS[job.type]}`}>
              {TYPE_LABELS[job.type]}
            </span>
            {isOwn && (
              <span className="text-xs text-ink-subtle bg-surface-sunken px-2 py-0.5 rounded-full">Ma publication</span>
            )}
            {canManage && isArchived && (
              <span className="text-xs bg-surface-sunken text-ink-muted px-2 py-0.5 rounded-full">Retirée</span>
            )}
          </div>
          <h3 className="font-semibold text-ink text-base leading-snug">{job.title}</h3>
          <p className="text-sm text-ink-muted mt-0.5">{job.company}</p>
          {job.location && (
            <p className="text-xs text-ink-subtle mt-0.5">{job.location}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-ink-subtle">
            {createdDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </p>
          {deadlineDate && (
            <p className={`text-xs mt-0.5 ${isExpiringSoon ? "text-danger font-medium" : "text-ink-subtle"}`}>
              Expire le {deadlineDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
            </p>
          )}
        </div>
      </div>
      <p className="text-sm text-ink-muted mt-2 line-clamp-2">{job.description}</p>
      {canManage && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={toggleStatus}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold border border-line rounded-lg hover:bg-surface-sunken disabled:opacity-50 transition-colors"
          >
            {loading ? "…" : isArchived ? "Republier" : "Retirer"}
          </button>
        </div>
      )}
    </Link>
  );
}
