import { requireAuth, getCurrentChurchId, requireChurchPermission, getUserMinistryScope } from "@/lib/auth";
import { resolveMemberDepartmentScope } from "@/lib/member-scope";
import { registry, rolePermissions } from "@/lib/registry";
import { listObservationMemberIds } from "@/modules/serving";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { CountBadge, PageHeader, buttonClasses } from "@/components/ui";
import MembersClient from "./MembersClient";
import LinkRequestsClient from "./LinkRequestsClient";
import { paths } from "@/lib/paths";

export default async function MembersPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-ink-muted">Aucune église sélectionnée.</p>;
  await requireChurchPermission("members:view", churchId);
  const churchRoles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  const userPermissions = new Set(
    churchRoles.flatMap((r) => rolePermissions[r.role] ?? [])
  );
  const canManage = userPermissions.has("members:manage");
  // Valider les demandes d'accès et lier/délier un compte relèvent d'access:manage, pas de
  // members:manage : un Resp. département gère ses fiches STAR mais plus ces deux gestes,
  // réservés à l'administration et au Ministre de son ministère (spec 054/#583, D3)
  const canLink = userPermissions.has("access:manage");
  const ministryScope = getUserMinistryScope(session, churchId);
  const scope = await resolveMemberDepartmentScope(session, churchId);

  const membersWhere = scope.scoped
    ? { departments: { some: { departmentId: { in: scope.departmentIds } } } }
    : { departments: { some: { department: { ministry: { churchId } } } } };

  const departmentsWhere = scope.scoped
    ? { id: { in: scope.departmentIds } }
    : { ministry: { churchId } };

  const ministryOrFilter = ministryScope.scoped
    ? {
        OR: [
          { ministryId: { in: ministryScope.ministryIds } },
          { department: { ministryId: { in: ministryScope.ministryIds } } },
        ],
      }
    : {};

  const [pendingRequests, rejectedRequests] = canLink
    ? await Promise.all([
        prisma.memberLinkRequest.findMany({
          where: { status: "PENDING", churchId, ...ministryOrFilter },
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
        }),
        prisma.memberLinkRequest.findMany({
          where: { status: "REJECTED", churchId, ...ministryOrFilter },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            requestedRole: true,
            rejectReason: true,
            reviewedAt: true,
            user: { select: { name: true, email: true } },
            member: { select: { firstName: true, lastName: true } },
          },
          orderBy: { reviewedAt: "desc" },
          take: 30,
        }),
      ])
    : [[], []];

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
      userLinks: {
        where: { churchId },
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

  // Badge « En observation » (candidatures au service, spec 077)
  const observation = registry.has("serving") ? await listObservationMemberIds(churchId) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="STAR"
        actions={
          canManage ? (
            <Link href={paths.admin.memberDuplicates()} className={buttonClasses("secondary", "md")}>
              Voir les doublons potentiels
            </Link>
          ) : undefined
        }
      />

      {(pendingRequests.length > 0 || rejectedRequests.length > 0) && (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 font-display text-[17px] font-semibold leading-6 text-ink">
            Demandes d&apos;accès
            {pendingRequests.length > 0 && <CountBadge count={pendingRequests.length} />}
          </h2>
          <LinkRequestsClient
            initialRequests={pendingRequests.map((r) => ({
              id: r.id,
              user: r.user,
              member: r.member,
              firstName: r.firstName,
              lastName: r.lastName,
              phone: r.phone,
              church: r.church,
              createdAt: r.createdAt.toISOString(),
              requestedRole: r.requestedRole as "DEPARTMENT_HEAD" | "DEPUTY" | "MINISTER" | "DISCIPLE_MAKER" | "REPORTER" | null,
              notes: r.notes,
            }))}
            departments={departments.map((d) => ({
              id: d.id,
              name: d.name,
              ministryName: d.ministry.name,
            }))}
            rejectedRequests={rejectedRequests.map((r) => ({
              id: r.id,
              user: r.user,
              member: r.member,
              firstName: r.firstName,
              lastName: r.lastName,
              requestedRole: r.requestedRole as "DEPARTMENT_HEAD" | "DEPUTY" | "MINISTER" | "DISCIPLE_MAKER" | "REPORTER" | null,
              rejectReason: r.rejectReason,
              reviewedAt: r.reviewedAt?.toISOString() ?? null,
            }))}
          />
        </section>
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
            userLink: m.userLinks[0]
              ? { userId: m.userLinks[0].userId, userName: m.userLinks[0].user.name, userEmail: m.userLinks[0].user.email }
              : null,
            churchId: primaryDept?.department.ministry.churchId ?? "",
            observationDeptIds: observation.filter((o) => o.memberId === m.id).map((o) => o.departmentId),
          };
        })}
        departments={departments.map((d) => ({
          id: d.id,
          name: d.name,
          ministryName: d.ministry.name,
        }))}
        readOnly={!canManage}
        canLink={canLink}
        scoped={scope.scoped}
        churchId={churchId}
      />
    </div>
  );
}
