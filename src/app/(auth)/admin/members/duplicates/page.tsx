import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { resolveMemberDepartmentScope } from "@/lib/member-scope";
import { rolePermissions } from "@/lib/registry";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import DuplicatesView from "./DuplicatesView";
import { buttonClasses } from "@/components/ui/button-classes";
import { duplicateGroups } from "@/lib/member-duplicates";

export default async function DuplicatesPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-ink-muted">Aucune église sélectionnée.</p>;
  await requireChurchPermission("members:manage", churchId);

  // Filtré au périmètre de l'appelant — un Resp. département ne voyait jusqu'ici les emails de
  // toute l'église (spec 054/#583, défaut B1). L'attribution du rôle STAR en masse relève
  // d'access:manage, distincte de members:manage (D3).
  const scope = await resolveMemberDepartmentScope(session, churchId);
  const canAssignStarRoles = new Set(
    session.user.churchRoles
      .filter((r) => r.churchId === churchId)
      .flatMap((r) => rolePermissions[r.role] ?? [])
  ).has("access:manage");
  const membersWhere = scope.scoped
    ? { departments: { some: { departmentId: { in: scope.departmentIds } } } }
    : { departments: { some: { department: { ministry: { churchId } } } } };

  const members = await prisma.member.findMany({
    where: membersWhere,
    include: {
      departments: {
        include: {
          department: { select: { id: true, name: true, ministry: { select: { name: true } } } },
        },
        orderBy: { isPrimary: "desc" },
      },
      userLinks: { where: { churchId }, select: { userId: true, user: { select: { name: true, email: true } } } },
      _count: { select: { plannings: true, discipleships: true, disciplesMade: true } },
    },
  });

  type MemberRow = (typeof members)[number];
  // Détection doublons : même nom normalisé ou même email
  const groups = duplicateGroups(members);

  function serializeMember(m: MemberRow) {
    return {
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      email: m.email,
      phone: m.phone,
      departments: m.departments.map((d) => ({
        id: d.department.id,
        name: d.department.name,
        ministryName: d.department.ministry.name,
        isPrimary: d.isPrimary,
      })),
      userLink: m.userLinks[0]
        ? { userId: m.userLinks[0].userId, name: m.userLinks[0].user.name, email: m.userLinks[0].user.email }
        : null,
      counts: { plannings: m._count.plannings, disciples: m._count.discipleships, disciplesMade: m._count.disciplesMade },
    };
  }

  const serialized = groups.map((g) => ({
    reason: g.reason,
    members: g.members.map(serializeMember),
  }));

  const allMembers = members.map(serializeMember);

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/members" className={buttonClasses("secondary", "sm")}>
          ← Retour
        </Link>
        <h1 className="text-2xl font-bold text-ink">Doublons potentiels</h1>
      </div>
      <DuplicatesView
        groups={serialized}
        allMembers={allMembers}
        churchId={churchId}
        canAssignStarRoles={canAssignStarRoles}
      />
    </div>
  );
}
