import { notFound } from "next/navigation";
import { requireAuth, getCurrentChurchId, requireChurchPermission, getUserMinistryScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessPerson, listInheritedAccess } from "@/lib/access-overview";
import { ALL_ROLES, PRIVILEGED_ROLES, ASSIGNABLE_BY_MINISTER } from "@/lib/roles";
import PersonAccessClient from "./PersonAccessClient";

export default async function PersonAccessPage({
  params,
}: {
  readonly params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-gray-500">Aucune église sélectionnée.</p>;
  await requireChurchPermission("access:manage", churchId);
  const ministryScope = getUserMinistryScope(session, churchId);

  // 404 plutôt que 403 : un Ministre au périmètre restreint ne doit pas pouvoir distinguer
  // « personne inexistante » de « personne hors de mon périmètre » (spec 054, critère Ministre)
  const person = await getAccessPerson(session, churchId, userId);
  if (!person) return notFound();

  const [roles, memberLink, inheritedByUser, ministries] = await Promise.all([
    prisma.userChurchRole.findMany({
      where: { userId, churchId },
      select: {
        id: true,
        role: true,
        ministryId: true,
        ministry: { select: { name: true } },
        departments: {
          select: { isDeputy: true, department: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.memberUserLink.findUnique({
      where: { userId_churchId: { userId, churchId } },
      select: { memberId: true, validatedAt: true, member: { select: { firstName: true, lastName: true } } },
    }),
    listInheritedAccess(churchId, [userId]),
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

  const assignableRoles = ALL_ROLES.filter((role) => {
    if (ministryScope.scoped && !ASSIGNABLE_BY_MINISTER.includes(role)) return false;
    if (PRIVILEGED_ROLES.includes(role) && !session.user.isSuperAdmin) return false;
    return true;
  });

  return (
    <PersonAccessClient
      churchId={churchId}
      person={{
        id: person.id,
        name: person.displayName || person.name || person.email,
        email: person.email,
        image: person.image,
      }}
      memberLink={
        memberLink
          ? {
              memberId: memberLink.memberId,
              memberName: `${memberLink.member.firstName} ${memberLink.member.lastName}`,
              validated: memberLink.validatedAt !== null,
            }
          : null
      }
      initialRoles={roles.map((r) => ({
        id: r.id,
        role: r.role,
        ministryId: r.ministryId,
        ministryName: r.ministry?.name ?? null,
        departments: r.departments.map((d) => ({ id: d.department.id, name: d.department.name, isDeputy: d.isDeputy })),
      }))}
      inheritedAccess={inheritedByUser.get(userId) ?? []}
      assignableRoles={assignableRoles}
      ministries={ministries}
    />
  );
}
