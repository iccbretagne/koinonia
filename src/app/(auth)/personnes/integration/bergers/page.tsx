import { forbidden } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { requireIntegrationAccess } from "@/modules/integration";
import { prisma } from "@/lib/prisma";
import LeadersDashboard from "./LeadersDashboard";

export default async function IntegrationLeadersPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="p-4 text-ink-muted">Aucune église sélectionnée.</p>;

  const { scope } = await requireIntegrationAccess(churchId);
  if (scope.scoped) {
    forbidden();
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
      <PageHeader
        className="mb-6"
        title="Bergers & co-bergers"
        description="Gérez les responsables de familles affectés au suivi des demandes d'intégration."
      />
      <LeadersDashboard
        churchId={churchId}
        initialAssignments={assignments}
        users={users}
      />
    </div>
  );
}
