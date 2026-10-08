import Link from "next/link";
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
        <div className="bg-surface rounded-xl border border-line p-5 mt-4">
          <h2 className="text-sm font-semibold text-ink-muted mb-2">Autres demandes de la personne</h2>
          <ul className="space-y-1.5">
            {related.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <Link
                  href={r.kind === "request" ? `/care/requests/${r.id}` : `/care/followups/${r.id}`}
                  className="text-sm text-brand-text hover:underline"
                >
                  {r.kind === "request" ? "Rendez-vous pastoral" : "Suivi de nouveau converti"} —{" "}
                  {relatedStatusLabels[r.status] ?? r.status}
                </Link>
              </li>
            ))}
          </ul>
        </div>
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
