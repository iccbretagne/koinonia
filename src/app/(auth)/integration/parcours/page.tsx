import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { requireIntegrationAccess } from "@/modules/integration";
import { prisma } from "@/lib/prisma";
import ParcoursView, { type Journey } from "./ParcoursView";

export default async function ParcoursPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-gray-500">Aucune église sélectionnée.</p>;

  const { scope } = await requireIntegrationAccess(churchId);
  if (scope.scoped) {
    return <p className="p-4 text-gray-500">Accès non autorisé aux parcours.</p>;
  }

  const journeys = await prisma.personJourney.findMany({
    where: { churchId },
    orderBy: { createdAt: "desc" },
    include: {
      sourceRequest: { select: { id: true, status: true, assignedFamilyName: true } },
    },
  });

  return <ParcoursView churchId={churchId} initialJourneys={journeys as unknown as Journey[]} />;
}
