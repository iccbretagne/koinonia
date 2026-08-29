import { requireChurchPermission, getCurrentChurchId, requireAuth, getUserMinistryScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AccessClient from "./AccessClient";

export default async function AccessPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-gray-500">Aucune église sélectionnée.</p>;
  // access:manage couvre SUPER_ADMIN, ADMIN, SECRETARY et MINISTER (borné à son
  // ministère ci-dessous) — aligné sur la garde de l'API (spec 031/#467)
  await requireChurchPermission("access:manage", churchId);
  const ministryScope = getUserMinistryScope(session, churchId);

  // Utilisateurs rattachés à cette église uniquement — rôle dans l'église, lien de
  // membre, ou demande de liaison (peu importe le statut) (spec 031, correction du
  // `where: {}` qui exposait tous les utilisateurs de la plateforme)
  const churchMembershipOr = [
    { churchRoles: { some: { churchId } } },
    { memberLinks: { some: { churchId } } },
    { memberLinkRequests: { some: { churchId } } },
  ];
  // Pour un appelant au périmètre de ministère restreint (Ministre), ne renvoyer que
  // les personnes rattachées à SES ministères — par un rôle, un adjoint, un lien de
  // membre ou une demande (spec 031/T21)
  const ministryOr = ministryScope.scoped
    ? [
        {
          churchRoles: {
            some: {
              churchId,
              OR: [
                { ministryId: { in: ministryScope.ministryIds } },
                { departments: { some: { department: { ministryId: { in: ministryScope.ministryIds } } } } },
              ],
            },
          },
        },
        {
          memberLinks: {
            some: {
              churchId,
              member: { departments: { some: { department: { ministryId: { in: ministryScope.ministryIds } } } } },
            },
          },
        },
        {
          memberLinkRequests: {
            some: {
              churchId,
              OR: [
                { ministryId: { in: ministryScope.ministryIds } },
                { department: { ministryId: { in: ministryScope.ministryIds } } },
              ],
            },
          },
        },
      ]
    : null;

  const users = await prisma.user.findMany({
    where: ministryOr
      ? { AND: [{ OR: churchMembershipOr }, { OR: ministryOr }] }
      : { OR: churchMembershipOr },
    select: {
      id: true,
      name: true,
      displayName: true,
      email: true,
      image: true,
      churchRoles: {
        where: { churchId },
        select: {
          id: true,
          role: true,
          ministryId: true,
          ministry: { select: { id: true, name: true } },
          departments: {
            select: {
              departmentId: true,
              isDeputy: true,
              department: { select: { id: true, name: true } },
            },
          },
        },
      },
      memberLinks: {
        where: { churchId },
        select: {
          memberId: true,
          validatedAt: true,
          member: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // Demandes d'accès en attente
  const pendingRequests = await prisma.memberLinkRequest.findMany({
    where: {
      churchId,
      status: "PENDING",
      ...(ministryScope.scoped
        ? {
            OR: [
              { ministryId: { in: ministryScope.ministryIds } },
              { department: { ministryId: { in: ministryScope.ministryIds } } },
            ],
          }
        : {}),
    },
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
  });

  // Demandes refusées (30 dernières)
  const rejectedRequests = await prisma.memberLinkRequest.findMany({
    where: {
      churchId,
      status: "REJECTED",
      ...(ministryScope.scoped
        ? {
            OR: [
              { ministryId: { in: ministryScope.ministryIds } },
              { department: { ministryId: { in: ministryScope.ministryIds } } },
            ],
          }
        : {}),
    },
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
  });

  // Ministries with departments for structure view
  const ministries = await prisma.ministry.findMany({
    where: {
      churchId,
      isSystem: false,
      ...(ministryScope.scoped ? { id: { in: ministryScope.ministryIds } } : {}),
    },
    select: {
      id: true,
      name: true,
      departments: {
        where: { isSystem: false },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Accès &amp; rôles</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gérez les ministres, responsables de département, rôles transverses (Admin, Secrétaire, Faiseur de Disciples) et accès aux comptes rendus.
        </p>
      </div>
      <AccessClient
        pendingRequests={pendingRequests.map((r) => ({
          id: r.id,
          user: {
            name: r.user.displayName || r.user.name || r.user.email,
            email: r.user.email,
            image: r.user.image,
          },
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
        users={users.map((u) => ({
          id: u.id,
          name: u.displayName || u.name || u.email,
          email: u.email,
          image: u.image,
          churchRoles: u.churchRoles.map((r) => ({
            id: r.id,
            role: r.role,
            ministryId: r.ministryId,
            ministryName: r.ministry?.name ?? null,
            departments: r.departments.map((d) => ({
              id: d.departmentId,
              name: d.department.name,
              isDeputy: d.isDeputy,
            })),
          })),
          memberLink: u.memberLinks[0]
            ? {
                memberId: u.memberLinks[0].memberId,
                memberName: `${u.memberLinks[0].member.firstName} ${u.memberLinks[0].member.lastName}`,
                validated: u.memberLinks[0].validatedAt !== null,
              }
            : null,
        }))}
        ministries={ministries.map((m) => ({
          id: m.id,
          name: m.name,
          departments: m.departments,
        }))}
        churchId={churchId}
        isSuperAdmin={session.user.isSuperAdmin ?? false}
        hideTransverseRoles={ministryScope.scoped}
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
      />
    </div>
  );
}
