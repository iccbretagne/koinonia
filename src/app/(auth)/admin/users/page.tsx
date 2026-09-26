import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-gray-500">Aucune église sélectionnée.</p>;
  await requireChurchPermission("users:manage", churchId);

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { churchRoles: { some: { churchId } } },
        { memberLinks: { some: { churchId } } },
      ],
    },
    include: {
      churchRoles: {
        where: { churchId },
        include: {
          church: { select: { id: true, name: true } },
          ministry: { select: { id: true, name: true } },
          departments: {
            include: { department: { select: { id: true, name: true } } },
          },
        },
      },
      _count: { select: { accounts: true } },
    },
    orderBy: { name: "asc" },
  });

  const ministries = await prisma.ministry.findMany({
    where: { churchId },
    select: { id: true, name: true, churchId: true },
    orderBy: { name: "asc" },
  });

  const departments = await prisma.department.findMany({
    where: { ministry: { churchId } },
    select: { id: true, name: true, ministry: { select: { churchId: true } } },
    orderBy: { name: "asc" },
  });

  // La page est déjà réservée à users:manage (Super Admin / Admin) — quiconque l'atteint peut
  // gérer les rôles depuis cet écran (spec 054/#583).
  const canManageRoles = true;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Utilisateurs</h1>
      <UsersClient
        churchId={churchId}
        initialUsers={users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          displayName: u.displayName,
          image: u.image,
          neverConnected: u._count.accounts === 0,
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
