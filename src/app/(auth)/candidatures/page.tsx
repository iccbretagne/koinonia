import Link from "next/link";
import { getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PublicFormBanner from "@/components/PublicFormBanner";
import { EmptyState, PageHeader } from "@/components/ui";
import { listApplications, type ApplicationSummary } from "@/modules/serving";
import { requireServingActor } from "@/modules/serving/auth";
import ApplicationsClient, { type ApplicationsTab } from "./ApplicationsClient";

/**
 * Candidatures au service (spec 073). Le PVS (et l'Admin) voit toutes les candidatures de
 * l'église ; un responsable ou un Ministre voit celles affectées à ses départements.
 */
export default async function CandidaturesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ onglet?: string }>;
}) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;

  const actor = await requireServingActor(churchId);
  const [pvs, departments, church] = await Promise.all([
    actor.canManage ? listApplications(actor, "pvs") : Promise.resolve<ApplicationSummary[]>([]),
    listApplications(actor, "department"),
    prisma.church.findUnique({ where: { id: churchId }, select: { slug: true } }),
  ]);

  if (!actor.canManage && departments.length === 0) {
    return (
      <EmptyState
        title="Aucune candidature"
        description="Les candidatures orientées vers tes départements apparaîtront ici."
      />
    );
  }

  const tabs: ApplicationsTab[] = actor.canManage
    ? ["todo", "ongoing", ...(departments.length > 0 ? (["departments"] as const) : []), "archived"]
    : ["departments"];
  const requested = (await searchParams).onglet as ApplicationsTab | undefined;
  const tab = requested && tabs.includes(requested) ? requested : tabs[0];

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <PageHeader
        title="Candidatures au service"
        description={
          actor.canManage
            ? "Fiches reçues par le formulaire « Servir » : étude, orientation vers les départements et suivi de l'observation."
            : "Personnes orientées vers tes départements par l'équipe Vie des STAR."
        }
        actions={
          actor.canEditSettings ? (
            <Link href="/candidatures/parametres" className="text-sm text-ink-subtle hover:text-brand-text transition-colors">
              Paramètres
            </Link>
          ) : undefined
        }
      />
      {actor.canManage && church?.slug && (
        <PublicFormBanner path={`/servir/${church.slug}`} label="Lien public — candidature au service" />
      )}
      <ApplicationsClient tab={tab} tabs={tabs} pvs={pvs} departments={departments} />
    </div>
  );
}
