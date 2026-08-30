"use client";

import { useState } from "react";
import Link from "next/link";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { buildWhatsAppRecap } from "./whatsapp-recap";

type JobType = "EMPLOI" | "STAGE" | "ALTERNANCE";

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

const TYPE_LABELS: Record<JobType, string> = {
  EMPLOI:     "Emploi",
  STAGE:      "Stage",
  ALTERNANCE: "Alternance",
};

const TYPE_COLORS: Record<JobType, string> = {
  EMPLOI:     "bg-icc-violet/10 text-icc-violet",
  STAGE:      "bg-icc-bleu/10 text-icc-bleu",
  ALTERNANCE: "bg-icc-jaune/20 text-amber-700",
};

export default function JobsListClient({
  jobs,
  currentUserId,
  nowMs,
}: {
  jobs: Job[];
  currentUserId: string;
  nowMs: number;
}) {
  const [filter, setFilter] = useState<JobType | "ALL">("ALL");
  const [copied, setCopied] = useState(false);
  const [fallbackText, setFallbackText] = useState<string | null>(null);

  const filtered = filter === "ALL" ? jobs : jobs.filter((j) => j.type === filter);

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
      <div className="flex items-center justify-between gap-2 mb-6 border-b border-gray-200">
        <div className="flex gap-1">
          {(["ALL", "EMPLOI", "STAGE", "ALTERNANCE"] as const).map((t) => {
            const count = t === "ALL" ? jobs.length : jobs.filter((j) => j.type === t).length;
            return (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  filter === t
                    ? "border-icc-violet text-icc-violet"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {t === "ALL" ? "Tout" : TYPE_LABELS[t]}
                <span className="ml-1.5 text-xs text-gray-400">({count})</span>
              </button>
            );
          })}
        </div>
        {filtered.length > 0 && (
          <button
            onClick={copyRecap}
            className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 mb-1 rounded-lg border border-icc-violet/30 text-icc-violet hover:bg-icc-violet/10 transition-colors font-medium"
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

      <Modal
        open={!!fallbackText}
        onClose={() => setFallbackText(null)}
        title="Copier le message"
      >
        <p className="text-sm text-gray-600 mb-3">
          La copie automatique n&apos;a pas fonctionné. Sélectionnez le texte ci-dessous et
          copiez-le manuellement.
        </p>
        <textarea
          readOnly
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          value={fallbackText ?? ""}
          rows={12}
          className="w-full text-xs font-mono border-2 border-gray-200 rounded-lg p-2 focus:ring-icc-violet focus:border-icc-violet"
        />
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={() => setFallbackText(null)}>
            Fermer
          </Button>
        </div>
      </Modal>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">Aucune offre pour le moment</p>
          <p className="text-sm mt-1">Soyez le premier à publier !</p>
          <Link href="/jobs/new" className="inline-block mt-4 px-4 py-2 bg-icc-violet text-white text-sm font-semibold rounded-lg hover:bg-icc-violet/90 transition-colors">
            Publier une offre
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((job) => (
            <JobCard key={job.id} job={job} isOwn={job.author.id === currentUserId} nowMs={nowMs} />
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({ job, isOwn, nowMs }: { job: Job; isOwn: boolean; nowMs: number }) {
  const deadlineDate = job.deadline ? new Date(job.deadline) : null;
  const createdDate  = new Date(job.createdAt);
  const isExpiringSoon = deadlineDate
    ? deadlineDate.getTime() - nowMs < 7 * 24 * 60 * 60 * 1000
    : false;

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block bg-white rounded-lg border-2 border-gray-100 p-5 hover:border-icc-violet/30 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${TYPE_COLORS[job.type]}`}>
              {TYPE_LABELS[job.type]}
            </span>
            {isOwn && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Ma publication</span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 text-base leading-snug">{job.title}</h3>
          <p className="text-sm text-gray-600 mt-0.5">{job.company}</p>
          {job.location && (
            <p className="text-xs text-gray-400 mt-0.5">{job.location}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-gray-400">
            {createdDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </p>
          {deadlineDate && (
            <p className={`text-xs mt-0.5 ${isExpiringSoon ? "text-icc-rouge font-medium" : "text-gray-400"}`}>
              Expire le {deadlineDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
            </p>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-500 mt-2 line-clamp-2">{job.description}</p>
    </Link>
  );
}
