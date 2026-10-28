import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { EmptyState, PageHeader, StatusChip, buttonClasses } from "@/components/ui";
import { getOwnApplication } from "@/modules/serving";
import ApplicationAnswers from "../ApplicationAnswers";
import { formatDay } from "../AssignmentChip";

/**
 * Ma fiche de candidature (spec 073, D8) : le STAR accueilli relit ses réponses, en lecture seule,
 * sans information interne (ni motif, ni département qui l'a renvoyé, ni observation « échue »).
 */
export default async function MyApplicationPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ churchId?: string }>;
}) {
  const session = await requireAuth().catch(() => null);
  if (!session) redirect("/");
  const { churchId } = await searchParams;
  const app = churchId ? await getOwnApplication(session.user.id, churchId) : null;

  if (!app) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Link href="/profile" className="text-sm text-ink-subtle hover:text-brand-text">
          ← Mon profil
        </Link>
        <EmptyState title="Aucune fiche de candidature" description="Aucune fiche de candidature n'est liée à ton compte." />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Link href="/profile" className="text-sm text-ink-subtle hover:text-brand-text">
        ← Mon profil
      </Link>
      <PageHeader
        title="Ma fiche de candidature"
        description={`Envoyée le ${formatDay(app.createdAt)}`}
        actions={
          <a href={`/api/serving/applications/${app.id}/pdf`} className={buttonClasses("secondary")}>
            Télécharger le PDF
          </a>
        }
      >
        <div className="mt-2 flex flex-wrap gap-1">
          {app.assignments.map((a) => (
            <StatusChip key={a.departmentName} tone={a.status === "CONFIRMED" ? "success" : "brand"}>
              {a.departmentName} ·{" "}
              {a.status === "CONFIRMED"
                ? "STAR confirmé"
                : a.observationEndsAt
                  ? `Observation jusqu'au ${formatDay(a.observationEndsAt)}`
                  : "En observation"}
            </StatusChip>
          ))}
        </div>
      </PageHeader>
      <ApplicationAnswers app={app} />
    </div>
  );
}
