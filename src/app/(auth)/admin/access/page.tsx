import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AccessClient from "./AccessClient";

export default async function AccessPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-gray-500">Aucune église sélectionnée.</p>;
  await requireChurchPermission("departments:manage", churchId);

  // All users in this church with their roles
  const users = await prisma.user.findMany({
    where: { churchRoles: { some: { churchId } } },
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
          Gérez les ministres, responsables de département et accès aux comptes rendus.
        </p>
      </div>
      <AccessClient
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
      />
    </div>
  );
}
