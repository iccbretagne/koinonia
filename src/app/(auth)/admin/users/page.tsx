import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (churchId) await requireChurchPermission("members:manage", churchId);

  const churchRoles = session.user.churchRoles;
  const isSuperAdmin = churchRoles.some((r) => r.role === "SUPER_ADMIN");
  const churchIds = Array.from(new Set(churchRoles.map((r) => r.churchId)));

  const users = await prisma.user.findMany({
    where: isSuperAdmin
      ? undefined
      : { churchRoles: { some: { churchId: { in: churchIds } } } },
    include: {
      churchRoles: {
        include: {
          church: { select: { id: true, name: true } },
          ministry: { select: { id: true, name: true } },
          departments: {
            include: { department: { select: { id: true, name: true } } },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const whereChurch = isSuperAdmin ? {} : { churchId: { in: churchIds } };

  const ministries = await prisma.ministry.findMany({
    where: whereChurch,
    select: { id: true, name: true, churchId: true },
    orderBy: { name: "asc" },
  });

  const departments = await prisma.department.findMany({
    where: { ministry: whereChurch },
    select: { id: true, name: true, ministry: { select: { churchId: true } } },
    orderBy: { name: "asc" },
  });

  const canManageRoles = isSuperAdmin || churchRoles.some((r) => r.role === "ADMIN");

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Utilisateurs</h1>
      <UsersClient
        initialUsers={users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          displayName: u.displayName,
          image: u.image,
          churchRoles: u.churchRoles.map((r) => ({
            id: r.id,
            role: r.role,
            church: r.church,
            ministry: r.ministry,
            departments: r.departments.map((d) => d.department),
          })),
        }))}
        ministries={ministries}
        departments={departments.map((d) => ({
          id: d.id,
          name: d.name,
          churchId: d.ministry.churchId,
        }))}
        canManageRoles={canManageRoles}
      />
    </div>
  );
}
