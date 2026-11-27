import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { requireIntegrationAccess, getIntegrationSettings, isRelanceDue } from "@/modules/integration";
import { prisma } from "@/lib/prisma";
import IntegrationDashboard from "./IntegrationDashboard";
import PublicFormBanner from "@/components/PublicFormBanner";
import { PageHeader } from "@/components/ui";

export default async function IntegrationRequestsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;

  const { scope } = await requireIntegrationAccess(churchId);

  const [church, rawRequests, delays] = await Promise.all([
    prisma.church.findUnique({ where: { id: churchId }, select: { slug: true } }),
    prisma.familyIntegrationRequest.findMany({
      where: {
        churchId,
        archivedAt: null,
        ...(scope.scoped && { assignedFamilyId: { in: scope.familyIds } }),
      },
      include: {
        assignedBerger: { select: { id: true, name: true } },
      },
      orderBy: { submittedAt: "desc" },
    }),
    getIntegrationSettings(churchId),
  ]);

  const now = new Date();
  const requests = rawRequests.map((r) => ({ ...r, relanceDue: isRelanceDue(r, delays, now) }));

  const pending = requests.filter((r) => r.status === "SUBMITTED").length;

  return (
    <div>
      <PageHeader
        className="mb-6"
        title="Demandes d'intégration"
        description={
          pending > 0
            ? `${pending} ${pending > 1 ? "demandes reçues attendent" : "demande reçue attend"} une affectation.`
            : undefined
        }
      />
      {church?.slug && !scope.scoped && (
        <div className="mb-6">
          <PublicFormBanner
            path={`/rejoindre/${church.slug}`}
            label="Lien public — formulaire de rejoindre une famille"
          />
        </div>
      )}
      <IntegrationDashboard
        requests={requests}
        isScoped={scope.scoped}
        canExport={!scope.scoped}
        churchId={churchId}
        currentUserId={session.user.id!}
      />
    </div>
  );
}
