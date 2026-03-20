import { requireAnyPermission, getCurrentChurchId } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import DiscipleshipClient from "./DiscipleshipClient";

export default async function DiscipleshipPage() {
  const session = await requireAnyPermission("discipleship:view");

  const userPermissions = new Set(
    session.user.churchRoles.flatMap((r) => hasPermission(r.role))
  );

  const canManage = userPermissions.has("discipleship:manage");
  const canExport = userPermissions.has("discipleship:export");
  const isFD = session.user.churchRoles.some((r) => r.role === "DISCIPLE_MAKER") && !session.user.isSuperAdmin;

  const churchId = await getCurrentChurchId(session);
  if (!churchId) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Discipolat</h1>
        <p className="text-gray-500">Aucune église sélectionnée.</p>
      </div>
    );
  }

  // Pour un FD, résoudre le membre lié pour pré-remplir le formulaire
  const linkedMemberId = isFD
    ? (await prisma.memberUserLink.findUnique({
        where: { userId_churchId: { userId: session.user.id, churchId } },
        select: { memberId: true },
      }))?.memberId ?? null
    : null;

  const [members, allAssignedDiscipleIds] = await Promise.all([
    prisma.member.findMany({
      where: { department: { ministry: { churchId } } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        department: { select: { name: true, ministry: { select: { name: true } } } },
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
        isFD={isFD}
        linkedMemberId={linkedMemberId}
      />
    </div>
  );
}
