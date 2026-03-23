import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import DiscipleshipClient from "./DiscipleshipClient";

export default async function DiscipleshipPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Discipolat</h1>
        <p className="text-gray-500">Aucune église sélectionnée.</p>
      </div>
    );
  }
  await requireChurchPermission("discipleship:view", churchId);

  const churchRoles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  const userPermissions = new Set(
    churchRoles.flatMap((r) => hasPermission(r.role))
  );

  const canManage = userPermissions.has("discipleship:manage");
  const canExport = userPermissions.has("discipleship:export");
  // isFD = vrai uniquement si le seul rôle discipolat est DISCIPLE_MAKER (pas admin/secrétariat)
  // Un admin/secrétariat qui est aussi FD garde la vue admin complète
  const isFD = churchRoles.some((r) => r.role === "DISCIPLE_MAKER") && !session.user.isSuperAdmin && !canManage;
  // Un admin/secrétariat peut éditer FD et premier FD
  const canEditRelation = canManage;

  // Pour un FD, résoudre le membre lié pour pré-remplir le formulaire
  const linkedMemberId = isFD
    ? (await prisma.memberUserLink.findUnique({
        where: { userId_churchId: { userId: session.user.id, churchId } },
        select: { memberId: true },
      }))?.memberId ?? null
    : null;

  const [members, allAssignedDiscipleIds] = await Promise.all([
    prisma.member.findMany({
      where: { departments: { some: { department: { ministry: { churchId } } } } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        departments: { where: { isPrimary: true }, select: { department: { select: { name: true, ministry: { select: { name: true } } } } } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    // Tous les disciples déjà assignés dans l'église (toutes relations confondues)
    prisma.discipleship.findMany({
      where: { churchId },
      select: { discipleId: true },
    }).then((rows) => rows.map((r) => r.discipleId)),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Discipolat</h1>
      <DiscipleshipClient
        churchId={churchId}
        members={members}
        allAssignedDiscipleIds={allAssignedDiscipleIds}
        canManage={canManage}
        canExport={canExport}
        canEditRelation={canEditRelation}
        isFD={isFD}
        linkedMemberId={linkedMemberId}
      />
    </div>
  );
}
