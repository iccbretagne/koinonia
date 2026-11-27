import Link from "next/link";
import { ChevronRight } from "lucide-react";
import HistoryTimeline from "@/components/HistoryTimeline";
import type { listRelatedItems } from "@/modules/care";

interface Props {
  readonly related: Awaited<ReturnType<typeof listRelatedItems>>;
  readonly relatedStatusLabels: Record<string, string>;
  readonly historyUrl: string;
  readonly statusLabels: Record<string, string>;
  readonly actionLabels: Record<string, string>;
}

/** Bas de fiche d'une demande de soin : autres demandes de la personne, puis historique. */
export default function CareItemFooter({ related, relatedStatusLabels, historyUrl, statusLabels, actionLabels }: Props) {
  return (
    <>
      {related.length > 0 && (
        <section className="mt-4 rounded-card border border-line bg-surface p-4 shadow-card md:p-5">
          <h2 className="mb-2 font-display text-[15px] font-semibold text-ink">Autres demandes de la personne</h2>
          <ul className="flex flex-col divide-y divide-line">
            {related.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <Link
                  href={r.kind === "request" ? `/care/requests/${r.id}` : `/care/followups/${r.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm text-ink transition-colors hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <span>
                    {r.kind === "request" ? "Rendez-vous pastoral" : "Suivi de nouveau converti"}
                    <span className="text-ink-muted"> · {relatedStatusLabels[r.status] ?? r.status}</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" strokeWidth={1.75} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-4">
        <HistoryTimeline
          fetchUrl={historyUrl}
          statusLabels={statusLabels}
          actionLabels={actionLabels}
          assigneeLabel="Référent"
        />
      </div>
    </>
  );
}
