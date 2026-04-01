import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AccessClient from "./AccessClient";

export default async function AccessPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-gray-500">Aucune église sélectionnée.</p>;
  await requireChurchPermission("departments:manage", churchId);

  // All users in this church (with roles) + new users (no roles yet)
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { churchRoles: { some: { churchId } } },
        { churchRoles: { none: {} } },
      ],
    },
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
    },
    orderBy: { name: "asc" },
  });

  // Demandes d'accès en attente
  const pendingRequests = await prisma.memberLinkRequest.findMany({
    where: { churchId, status: "PENDING" },
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

  // Ministries with departments for structure view
  const ministries = await prisma.ministry.findMany({
    where: { churchId, isSystem: false },
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
        }))}
        ministries={ministries.map((m) => ({
          id: m.id,
          name: m.name,
          departments: m.departments,
        }))}
        churchId={churchId}
        isSuperAdmin={session.user.isSuperAdmin ?? false}
      />
    </div>
  );
}
