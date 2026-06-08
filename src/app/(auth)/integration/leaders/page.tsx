import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { requireIntegrationAccess } from "@/modules/integration";
import { prisma } from "@/lib/prisma";
import LeadersDashboard from "./LeadersDashboard";

export default async function IntegrationLeadersPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-gray-500">Aucune église sélectionnée.</p>;

  const { scope } = await requireIntegrationAccess(churchId);
  if (scope.scoped) {
    return <p className="p-4 text-gray-500">Accès non autorisé.</p>;
  }

  const [assignments, users] = await Promise.all([
    prisma.familyLeaderAssignment.findMany({
      where: { churchId },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
      orderBy: [{ familyId: "asc" }, { role: "asc" }],
    }),
    prisma.user.findMany({
      where: {
        OR: [
          { churchRoles: { some: { churchId } } },
          { memberLinks: { some: { churchId, validatedAt: { not: null } } } },
        ],
      },
      select: { id: true, name: true, email: true, image: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bergers &amp; co-bergers</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gérez les responsables de familles affectés au suivi des demandes d&apos;intégration.
        </p>
      </div>
      <LeadersDashboard
        churchId={churchId}
        initialAssignments={assignments}
        users={users}
      />
    </div>
  );
}
