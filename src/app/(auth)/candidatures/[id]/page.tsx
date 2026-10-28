import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveChurchId } from "@/lib/auth";
import { ApiError } from "@/lib/api-utils";
import { Alert, EmptyState, PageHeader, StatusChip, buttonClasses } from "@/components/ui";
import { getApplication } from "@/modules/serving";
import { requireServingActor } from "@/modules/serving/auth";
import { APPLICATION_STATUS_LABEL } from "@/modules/serving/schemas";
import ApplicationAnswers from "../ApplicationAnswers";
import AssignmentChip, { formatDay } from "../AssignmentChip";
import ApplicationActions from "./ApplicationActions";

/**
 * Fiche de candidature (spec 073). L'église qui fait foi est celle de la candidature ; chaque
 * ouverture est journalisée (`VIEW`).
 */
export default async function CandidaturePage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  let app;
  try {
    const actor = await requireServingActor(await resolveChurchId("servingApplication", id));
    app = await getApplication(actor, id);
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) notFound();
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return <EmptyState title="Accès refusé" description="Cette candidature n'est pas visible pour toi." />;
    }
    throw error;
  }

  const hasActive = app.assignments.some((a) => a.status !== "SENT_BACK");
  const canReject = app.canManage && app.status !== "REJECTED" && !hasActive;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Link href="/candidatures" className="text-sm text-ink-subtle hover:text-brand-text">
        ← Candidatures
      </Link>
      <PageHeader
        title={`${app.firstName} ${app.lastName}`}
        description={`Reçue le ${formatDay(app.createdAt)}`}
        actions={
          <a href={`/api/serving/applications/${app.id}/pdf`} className={buttonClasses("secondary")}>
            Télécharger le PDF
          </a>
        }
      >
        <div className="mt-2 flex flex-wrap gap-1">
          <StatusChip tone={app.status === "REJECTED" ? "neutral" : "info"}>{APPLICATION_STATUS_LABEL[app.status]}</StatusChip>
        </div>
      </PageHeader>

      {app.canManage && app.hasPendingSendBack && (
        <Alert tone="warning" title="Renvoyée au PVS">
          Un département a renvoyé cette personne : réoriente-la vers un autre département ou ne la retiens pas.
        </Alert>
      )}
      {app.canManage && app.status === "REJECTED" && (
        <Alert tone="info" title="Non retenue">
          {app.rejectionReason ? `Motif : ${app.rejectionReason}` : "Aucun motif renseigné."}
        </Alert>
      )}

      {app.assignments.length > 0 && (
        <section className="bg-surface rounded-xl border border-line p-4 sm:p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-text mb-3">Affectations</h2>
          <ul className="space-y-3">
            {app.assignments.map((a) => (
              <li key={a.id} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <AssignmentChip departmentName={a.departmentName} status={a.status} observationEndsAt={a.observationEndsAt} overdue={a.overdue} />
                  {a.decidedAt && <span className="text-xs text-ink-subtle">le {formatDay(a.decidedAt)}</span>}
                </div>
                {a.sentBackReason && <p className="text-sm text-ink-muted">Motif du renvoi : {a.sentBackReason}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {canReject && <ApplicationActions applicationId={app.id} name={`${app.firstName} ${app.lastName}`} />}

      <ApplicationAnswers app={app} />
    </div>
  );
}
