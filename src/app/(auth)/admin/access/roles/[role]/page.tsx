import { notFound } from "next/navigation";
import { requireAuth, getCurrentChurchId, requireChurchPermission, getUserMinistryScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadAccessPeople } from "@/lib/access-overview";
import { ALL_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, PRIVILEGED_ROLES, ASSIGNABLE_BY_MINISTER } from "@/lib/roles";
import type { Role } from "@/generated/prisma/client";
import RoleHoldersClient from "./RoleHoldersClient";

export default async function RoleHoldersPage({
  params,
}: {
  readonly params: Promise<{ role: string }>;
}) {
  const { role: roleParam } = await params;
  if (!ALL_ROLES.includes(roleParam as Role)) return notFound();
  const role = roleParam as Role;

  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-gray-500">Aucune église sélectionnée.</p>;
  await requireChurchPermission("access:manage", churchId);
  const ministryScope = getUserMinistryScope(session, churchId);

  // Un Ministre au périmètre restreint ne voit ni n'attribue aucun rôle transverse (spec 054)
  if (ministryScope.scoped && !ASSIGNABLE_BY_MINISTER.includes(role)) return notFound();

  const canManage = !PRIVILEGED_ROLES.includes(role) || session.user.isSuperAdmin;

  const [allHolders, scopedPeople] = await Promise.all([
    prisma.userChurchRole.findMany({
      where: { role, churchId },
      select: {
        id: true,
        userId: true,
        ministryId: true,
        ministry: { select: { name: true } },
        departments: { select: { isDeputy: true, department: { select: { id: true, name: true } } } },
        user: { select: { id: true, name: true, displayName: true, email: true, image: true } },
      },
    }),
    loadAccessPeople(session, churchId),
  ]);

  const scopedIds = new Set(scopedPeople.map((p) => p.id));
  const holders = allHolders.filter((h) => scopedIds.has(h.userId));

  const holderIds = new Set(holders.map((h) => h.userId));
  const addableUsers = scopedPeople.filter((p) => !holderIds.has(p.id));

  const ministries =
    role === "MINISTER" || role === "DEPARTMENT_HEAD"
      ? await prisma.ministry.findMany({
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
        })
      : [];

  return (
    <RoleHoldersClient
      churchId={churchId}
      role={role}
      label={ROLE_LABELS[role]}
      description={ROLE_DESCRIPTIONS[role]}
      canManage={canManage}
      holders={holders.map((h) => ({
        roleId: h.id,
        user: {
          id: h.user.id,
          name: h.user.displayName || h.user.name || h.user.email,
          email: h.user.email,
          image: h.user.image,
        },
        ministryId: h.ministryId,
        ministryName: h.ministry?.name ?? null,
        departments: h.departments.map((d) => ({ id: d.department.id, name: d.department.name, isDeputy: d.isDeputy })),
      }))}
      addableUsers={addableUsers.map((p) => ({ id: p.id, name: p.displayName || p.name || p.email }))}
      ministries={ministries}
    />
  );
}
