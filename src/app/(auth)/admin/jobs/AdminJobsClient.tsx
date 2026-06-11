"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type JobType = "EMPLOI" | "STAGE" | "ALTERNANCE";

interface Job {
  id: string;
  title: string;
  type: JobType;
  company: string;
  status: "PUBLISHED" | "ARCHIVED";
  deadline: string | null;
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

export default function AdminJobsClient({ jobs }: { jobs: Job[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"ALL" | "PUBLISHED" | "ARCHIVED">("ALL");
  const [loading, setLoading] = useState<string | null>(null);

  const filtered = jobs.filter((j) => filter === "ALL" || j.status === filter);
  const publishedCount = jobs.filter((j) => j.status === "PUBLISHED").length;
  const archivedCount  = jobs.filter((j) => j.status === "ARCHIVED").length;

  async function toggleStatus(job: Job) {
    setLoading(job.id);
    try {
      const newStatus = job.status === "PUBLISHED" ? "ARCHIVED" : "PUBLISHED";
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer définitivement cette offre ?")) return;
    setLoading(id);
    try {
      const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {([
          { key: "ALL",       label: "Tout",    count: jobs.length },
          { key: "PUBLISHED", label: "Publiées",count: publishedCount },
          { key: "ARCHIVED",  label: "Archivées",count: archivedCount },
        ] as const).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              filter === key
                ? "border-icc-violet text-icc-violet"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label} <span className="ml-1 text-xs text-gray-400">({count})</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-gray-400 py-12">Aucune offre.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((job) => {
            const author      = job.author.displayName ?? job.author.name ?? "Inconnu";
            const deadline    = job.deadline ? new Date(job.deadline) : null;
            const isArchived  = job.status === "ARCHIVED";

            return (
              <div
                key={job.id}
                className={`bg-white rounded-lg border-2 p-4 flex items-center gap-4 ${isArchived ? "border-gray-100 opacity-60" : "border-gray-200"}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[job.type]}`}>
                      {TYPE_LABELS[job.type]}
                    </span>
                    {isArchived && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Archivée</span>
                    )}
                  </div>
                  <Link href={`/jobs/${job.id}`} className="font-semibold text-gray-900 hover:text-icc-violet text-sm">
                    {job.title}
                  </Link>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {job.company} — par {author}
                    {deadline && ` — expire le ${deadline.toLocaleDateString("fr-FR")}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleStatus(job)}
                    disabled={loading === job.id}
                    className="px-3 py-1.5 text-xs font-semibold border-2 border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {loading === job.id ? "…" : isArchived ? "Republier" : "Archiver"}
                  </button>
                  <button
                    onClick={() => handleDelete(job.id)}
                    disabled={loading === job.id}
                    className="px-3 py-1.5 text-xs font-semibold border-2 border-icc-rouge/30 text-icc-rouge rounded-lg hover:bg-icc-rouge/5 disabled:opacity-50 transition-colors"
                  >
                    {loading === job.id ? "…" : "Supprimer"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
