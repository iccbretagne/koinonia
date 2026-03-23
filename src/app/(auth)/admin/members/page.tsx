import { requireAuth, getCurrentChurchId, requireChurchPermission, getUserDepartmentScope } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import MembersClient from "./MembersClient";
import LinkRequestsClient from "./LinkRequestsClient";

export default async function MembersPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (churchId) await requireChurchPermission("members:view", churchId);
  const churchRoles = churchId
    ? session.user.churchRoles.filter((r) => r.churchId === churchId)
    : session.user.churchRoles;
  const userPermissions = new Set(
    churchRoles.flatMap((r) => hasPermission(r.role))
  );
  const canManage = userPermissions.has("members:manage");
  const scope = getUserDepartmentScope(session);

  const churchIds = Array.from(
    new Set(session.user.churchRoles.map((r) => r.churchId))
  );

  const membersWhere = scope.scoped
    ? { departments: { some: { departmentId: { in: scope.departmentIds } } } }
    : churchIds.length > 0
      ? { departments: { some: { department: { ministry: { churchId: { in: churchIds } } } } } }
      : undefined;

  const departmentsWhere = scope.scoped
    ? { id: { in: scope.departmentIds } }
    : churchIds.length > 0
      ? { ministry: { churchId: { in: churchIds } } }
      : undefined;

  const pendingRequests = canManage
    ? await prisma.memberLinkRequest.findMany({
        where: {
          status: "PENDING",
          ...(churchIds.length > 0 ? { churchId: { in: churchIds } } : {}),
        },
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
          member: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              departments: {
                where: { isPrimary: true },
                include: { department: { select: { name: true, ministry: { select: { name: true } } } } },
              },
            },
          },
          church: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const members = await prisma.member.findMany({
    where: membersWhere,
    include: {
      departments: {
        include: {
          department: {
            select: { id: true, name: true, ministry: { select: { id: true, name: true, churchId: true } } },
          },
        },
        orderBy: { isPrimary: "desc" },
      },
      userLink: {
        select: { userId: true, user: { select: { name: true, email: true } } },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const departments = await prisma.department.findMany({
    where: departmentsWhere,
    include: { ministry: { select: { id: true, name: true } } },
    orderBy: [{ ministry: { name: "asc" } }, { name: "asc" }],
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">STAR</h1>

      {pendingRequests.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
            Demandes d&apos;accès en attente
            <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-icc-violet rounded-full">
              {pendingRequests.length}
            </span>
          </h2>
          <LinkRequestsClient
            initialRequests={pendingRequests.map((r) => ({
              ...r,
              createdAt: r.createdAt.toISOString(),
            }))}
            departments={departments.map((d) => ({
              id: d.id,
              name: d.name,
              ministryName: d.ministry.name,
            }))}
          />
        </div>
      )}

      <MembersClient
        initialMembers={members.map((m) => {
          const primaryDept = m.departments.find((d) => d.isPrimary) ?? m.departments[0];
          return {
            ...m,
            primaryDepartment: primaryDept
              ? { id: primaryDept.department.id, name: primaryDept.department.name, ministry: { id: primaryDept.department.ministry.id, name: primaryDept.department.ministry.name } }
              : null,
            allDepartments: m.departments.map((d) => ({
              id: d.department.id,
              name: d.department.name,
              isPrimary: d.isPrimary,
              ministry: { id: d.department.ministry.id, name: d.department.ministry.name },
            })),
            userLink: m.userLink
              ? { userId: m.userLink.userId, userName: m.userLink.user.name, userEmail: m.userLink.user.email }
              : null,
            churchId: primaryDept?.department.ministry.churchId ?? "",
          };
        })}
        departments={departments.map((d) => ({
          id: d.id,
          name: d.name,
          ministryName: d.ministry.name,
        }))}
        readOnly={!canManage}
      />
    </div>
  );
}
