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

export default function JobDetailClient({
  job,
  canManage,
  isAuthor,
}: {
  job: Job;
  canManage: boolean;
  isAuthor: boolean;
}) {
  const router = useRouter();
  const [archiving, setArchiving] = useState(false);
  const [deleting,  setDeleting]  = useState(false);

  const isArchived = job.status === "ARCHIVED";

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
        <Link href="/jobs" className="text-sm text-gray-400 hover:text-gray-600">← Toutes les offres</Link>
      </div>

      <div className="bg-white rounded-lg border-2 border-gray-200 p-6">
        {isArchived && (
          <div className="mb-4 px-4 py-2 bg-gray-100 text-gray-500 text-sm rounded-lg">
            Cette offre est archivée et n&apos;est plus visible dans la liste.
          </div>
        )}

        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full mb-2 ${TYPE_COLORS[job.type]}`}>
              {TYPE_LABELS[job.type]}
            </span>
            <h1 className="text-xl font-bold text-gray-900">{job.title}</h1>
            <p className="text-gray-600 mt-0.5">{job.company}</p>
            {job.location && <p className="text-sm text-gray-400 mt-0.5">{job.location}</p>}
          </div>

          {(canManage || isAuthor) && (
            <div className="flex gap-2 shrink-0">
              {isAuthor && !isArchived && (
                <Link
                  href={`/jobs/${job.id}/edit`}
                  className="px-3 py-1.5 text-xs font-semibold border-2 border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Modifier
                </Link>
              )}
              {(canManage || isAuthor) && (
                <button
                  onClick={toggleArchive}
                  disabled={archiving}
                  className="px-3 py-1.5 text-xs font-semibold border-2 border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {archiving ? "…" : isArchived ? "Republier" : "Archiver"}
                </button>
              )}
              {(canManage || isAuthor) && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-1.5 text-xs font-semibold border-2 border-icc-rouge/30 text-icc-rouge rounded-lg hover:bg-icc-rouge/5 disabled:opacity-50 transition-colors"
                >
                  {deleting ? "…" : "Supprimer"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500 mb-5 py-3 border-y border-gray-100">
          {job.duration && <span>Durée : <strong className="text-gray-700">{job.duration}</strong></span>}
          {deadlineDate && (
            <span>
              Date limite : <strong className="text-gray-700">{deadlineDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</strong>
            </span>
          )}
          <span>
            Publié par <strong className="text-gray-700">{authorName}</strong> le {createdDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </span>
        </div>

        {/* Description */}
        <div className="prose prose-sm max-w-none">
          <p className="text-gray-700 whitespace-pre-wrap">{job.description}</p>
        </div>

        {/* Contact */}
        {(job.contactEmail || job.contactUrl) && (
          <div className="mt-6 pt-5 border-t border-gray-100">
            <p className="text-sm font-semibold text-gray-700 mb-2">Candidature</p>
            {job.contactEmail && (
              <a
                href={`mailto:${job.contactEmail}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-icc-violet text-white text-sm font-semibold rounded-lg hover:bg-icc-violet/90 transition-colors"
              >
                Envoyer un email →
              </a>
            )}
            {job.contactUrl && (
              <a
                href={job.contactUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-icc-violet text-white text-sm font-semibold rounded-lg hover:bg-icc-violet/90 transition-colors"
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
