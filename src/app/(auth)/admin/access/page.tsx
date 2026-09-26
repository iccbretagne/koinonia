import { requireChurchPermission, getCurrentChurchId, requireAuth, getUserMinistryScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadAccessPeople, listInheritedAccess } from "@/lib/access-overview";
import AccessTabs from "./AccessTabs";
import PeopleList from "./PeopleList";
import RolesOverview from "./RolesOverview";
import RequestsPanel from "./RequestsPanel";

export default async function AccessPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-gray-500">Aucune église sélectionnée.</p>;
  // access:manage couvre SUPER_ADMIN, ADMIN, SECRETARY et MINISTER (borné à son
  // ministère ci-dessous) — aligné sur la garde de l'API (spec 031/#467)
  await requireChurchPermission("access:manage", churchId);
  const ministryScope = getUserMinistryScope(session, churchId);

  const people = await loadAccessPeople(session, churchId);
  const userIds = people.map((p) => p.id);

  const [roleRows, inheritedByUser, ministries] = await Promise.all([
    prisma.userChurchRole.findMany({
      where: { userId: { in: userIds }, churchId },
      select: { userId: true, role: true },
    }),
    listInheritedAccess(churchId, userIds),
    prisma.ministry.findMany({
      where: {
        churchId,
        isSystem: false,
        ...(ministryScope.scoped ? { id: { in: ministryScope.ministryIds } } : {}),
      },
      select: {
        id: true,
        name: true,
        departments: { where: { isSystem: false }, select: { id: true, name: true }, orderBy: { name: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const rolesByUser = new Map<string, string[]>();
  for (const row of roleRows) {
    const list = rolesByUser.get(row.userId) ?? [];
    list.push(row.role);
    rolesByUser.set(row.userId, list);
  }

  const peopleWithSummary = people.map((p) => ({
    ...p,
    roles: rolesByUser.get(p.id) ?? [],
    inheritedCount: inheritedByUser.get(p.id)?.length ?? 0,
  }));

  // Demandes d'accès en attente / refusées — filtrées au ministère pour un Ministre restreint
  // (requête historique de l'ancienne page, conservée à l'identique)
  const ministryOrFilter = ministryScope.scoped
    ? {
        OR: [
          { ministryId: { in: ministryScope.ministryIds } },
          { department: { ministryId: { in: ministryScope.ministryIds } } },
        ],
      }
    : {};

  const [pendingRequests, rejectedRequests] = await Promise.all([
    prisma.memberLinkRequest.findMany({
      where: { churchId, status: "PENDING", ...ministryOrFilter },
      include: {
        user: { select: { id: true, name: true, displayName: true, email: true, image: true } },
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            departments: {
              where: { isPrimary: true },
              select: { department: { select: { name: true, ministry: { select: { name: true } } } } },
            },
          },
        },
        department: { select: { id: true, name: true, ministry: { select: { id: true, name: true } } } },
        ministry: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.memberLinkRequest.findMany({
      where: { churchId, status: "REJECTED", ...ministryOrFilter },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        requestedRole: true,
        rejectReason: true,
        reviewedAt: true,
        user: { select: { name: true, displayName: true, email: true } },
        member: { select: { firstName: true, lastName: true } },
      },
      orderBy: { reviewedAt: "desc" },
      take: 30,
    }),
  ]);

  const roleCounts: Record<string, number> = {};
  for (const list of rolesByUser.values()) {
    for (const role of list) roleCounts[role] = (roleCounts[role] ?? 0) + 1;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Accès &amp; rôles</h1>
        <p className="text-sm text-gray-500 mt-1">
          Retrouvez une personne pour voir tous ses accès, ou un rôle pour voir tous ses détenteurs.
        </p>
      </div>
      <AccessTabs
        requestCount={pendingRequests.length}
        peopleTab={
          <PeopleList
            people={peopleWithSummary.map((p) => ({
              id: p.id,
              name: p.displayName || p.name || p.email,
              email: p.email,
              image: p.image,
              roles: p.roles,
              inheritedCount: p.inheritedCount,
            }))}
          />
        }
        rolesTab={<RolesOverview roleCounts={roleCounts} hideTransverseRoles={ministryScope.scoped} />}
        requestsTab={
          <RequestsPanel
            pendingRequests={pendingRequests.map((r) => ({
              id: r.id,
              user: { name: r.user.displayName || r.user.name || r.user.email, email: r.user.email, image: r.user.image },
              member: r.member
                ? {
                    id: r.member.id,
                    firstName: r.member.firstName,
                    lastName: r.member.lastName,
                    deptName: r.member.departments[0]?.department.name ?? null,
                    ministryName: r.member.departments[0]?.department.ministry.name ?? null,
                  }
                : null,
              firstName: r.firstName,
              lastName: r.lastName,
              department: r.department
                ? { id: r.department.id, name: r.department.name, ministryName: r.department.ministry.name }
                : null,
              ministry: r.ministry ? { id: r.ministry.id, name: r.ministry.name } : null,
              requestedRole: r.requestedRole,
              notes: r.notes,
              createdAt: r.createdAt.toISOString(),
            }))}
            rejectedRequests={rejectedRequests.map((r) => ({
              id: r.id,
              user: { name: r.user.displayName || r.user.name || r.user.email, email: r.user.email },
              member: r.member ? { firstName: r.member.firstName, lastName: r.member.lastName } : null,
              firstName: r.firstName,
              lastName: r.lastName,
              requestedRole: r.requestedRole,
              rejectReason: r.rejectReason,
              reviewedAt: r.reviewedAt?.toISOString() ?? null,
            }))}
            ministries={ministries}
          />
        }
      />
    </div>
  );
}
