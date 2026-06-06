import { requireAuth, getCurrentChurchId, requireIntegrationAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import IntegrationDashboard from "./IntegrationDashboard";
import PublicFormBanner from "./PublicFormBanner";

export default async function IntegrationRequestsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-gray-500">Aucune église sélectionnée.</p>;

  const { scope } = await requireIntegrationAccess(churchId);

  const [church, requests] = await Promise.all([
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
  ]);

  const pending = requests.filter((r) => r.status === "SUBMITTED").length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Demandes d&apos;intégration</h1>
        {pending > 0 && (
          <span className="bg-icc-violet text-white text-sm font-bold px-2.5 py-1 rounded-full">
            {pending}
          </span>
        )}
      </div>
      {church?.slug && !scope.scoped && (
        <div className="mb-6">
          <PublicFormBanner slug={church.slug} />
        </div>
      )}
      <IntegrationDashboard requests={requests} isScoped={scope.scoped} />
    </div>
  );
}
