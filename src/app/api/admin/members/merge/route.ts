import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { resolveMemberDepartmentScope, isMemberFullyInScope } from "@/lib/member-scope";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { Prisma } from "@/generated/prisma/client";
import { schema } from "./contract";

async function getMemberChurchId(memberId: string): Promise<string | null> {
  const m = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      departments: {
        where: { isPrimary: true },
        include: { department: { include: { ministry: { select: { churchId: true } } } } },
      },
    },
  });
  if (!m) return null;
  return m.departments[0]?.department.ministry.churchId ?? null;
}

type Tx = Prisma.TransactionClient;

/** Départements de la source non portés par la cible ; les doublons partent avec la source (cascade). */
async function moveDepartments(tx: Tx, sourceId: string, targetId: string) {
  const sourceDepts = await tx.memberDepartment.findMany({ where: { memberId: sourceId } });
  const targetDeptIds = new Set(
    (await tx.memberDepartment.findMany({ where: { memberId: targetId } })).map((d) => d.departmentId)
  );
  for (const sd of sourceDepts) {
    if (!targetDeptIds.has(sd.departmentId)) {
      await tx.memberDepartment.update({ where: { id: sd.id }, data: { memberId: targetId } });
    }
  }
}

/** Planning — contrainte unique (eventDepartmentId, memberId) : un doublon de la cible est supprimé. */
async function movePlannings(tx: Tx, sourceId: string, targetId: string) {
  const srcPlannings = await tx.planning.findMany({ where: { memberId: sourceId } });
  for (const p of srcPlannings) {
    const conflict = await tx.planning.findFirst({
      where: { eventDepartmentId: p.eventDepartmentId, memberId: targetId },
    });
    if (conflict) await tx.planning.delete({ where: { id: p.id } });
    else await tx.planning.update({ where: { id: p.id }, data: { memberId: targetId } });
  }
}

/** TaskAssignment — contrainte unique (taskId, eventId, memberId) : un doublon est supprimé. */
async function moveTaskAssignments(tx: Tx, sourceId: string, targetId: string) {
  const srcTasks = await tx.taskAssignment.findMany({ where: { memberId: sourceId } });
  for (const t of srcTasks) {
    const conflict = await tx.taskAssignment.findFirst({
      where: { taskId: t.taskId, eventId: t.eventId, memberId: targetId },
    });
    if (conflict) await tx.taskAssignment.delete({ where: { id: t.id } });
    else await tx.taskAssignment.update({ where: { id: t.id }, data: { memberId: targetId } });
  }
}

/** Présences au discipolat : une par événement et par membre. */
async function moveAttendances(tx: Tx, sourceId: string, targetId: string) {
  const srcAttendances = await tx.discipleshipAttendance.findMany({ where: { memberId: sourceId } });
  for (const a of srcAttendances) {
    const conflict = await tx.discipleshipAttendance.findFirst({
      where: { memberId: targetId, eventId: a.eventId },
    });
    if (conflict) await tx.discipleshipAttendance.delete({ where: { id: a.id } });
    else await tx.discipleshipAttendance.update({ where: { id: a.id }, data: { memberId: targetId } });
  }
}

/** Relations de discipolat où la source est disciple : une par église et par disciple. */
async function moveDiscipleships(tx: Tx, sourceId: string, targetId: string) {
  const srcDiscipleships = await tx.discipleship.findMany({ where: { discipleId: sourceId } });
  for (const d of srcDiscipleships) {
    const conflict = await tx.discipleship.findFirst({
      where: { discipleId: targetId, churchId: d.churchId },
    });
    if (conflict) await tx.discipleship.delete({ where: { id: d.id } });
    else await tx.discipleship.update({ where: { id: d.id }, data: { discipleId: targetId } });
  }
}

/**
 * Compte lié : si les deux fiches en ont un, on garde celui choisi (`keepUserId`) ; si seule la
 * source en a un, il passe à la cible ; si seule la cible en a un, rien ne change.
 */
async function moveUserLink(
  tx: Tx,
  sourceId: string,
  targetId: string,
  churchId: string,
  keepUserId: string | null | undefined
) {
  const srcLink = await tx.memberUserLink.findUnique({ where: { memberId_churchId: { memberId: sourceId, churchId } } });
  if (!srcLink) return;
  const tgtLink = await tx.memberUserLink.findUnique({ where: { memberId_churchId: { memberId: targetId, churchId } } });

  const keepSource = !tgtLink || keepUserId === srcLink.userId;
  if (tgtLink) await tx.memberUserLink.delete({ where: { id: keepSource ? tgtLink.id : srcLink.id } });
  if (keepSource) await tx.memberUserLink.update({ where: { id: srcLink.id }, data: { memberId: targetId } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sourceId, targetId, resolution } = schema.parse(body);

    if (sourceId === targetId) throw new ApiError(400, "Source et cible identiques");

    const [srcChurchId, tgtChurchId] = await Promise.all([
      getMemberChurchId(sourceId),
      getMemberChurchId(targetId),
    ]);

    if (!srcChurchId) throw new ApiError(404, "Membre source introuvable");
    if (!tgtChurchId) throw new ApiError(404, "Membre cible introuvable");
    if (srcChurchId !== tgtChurchId) throw new ApiError(400, "Les membres n'appartiennent pas à la même église");

    const session = await requireChurchPermission("members:manage", srcChurchId);

    // Appelant restreint : la fusion supprime la fiche source et déplace ses affiliations, donc
    // les DEUX fiches doivent être entièrement dans son périmètre — plus strict que la
    // modification, qui préserve les affiliations hors périmètre (spec 054/#583, défaut B1)
    const memberScope = await resolveMemberDepartmentScope(session, srcChurchId);
    if (memberScope.scoped) {
      const [sourceDepts, targetDepts] = await Promise.all([
        prisma.memberDepartment.findMany({ where: { memberId: sourceId }, select: { departmentId: true } }),
        prisma.memberDepartment.findMany({ where: { memberId: targetId }, select: { departmentId: true } }),
      ]);
      const bothInScope =
        isMemberFullyInScope(memberScope, sourceDepts.map((d) => d.departmentId)) &&
        isMemberFullyInScope(memberScope, targetDepts.map((d) => d.departmentId));
      if (!bothInScope) throw new ApiError(403, "Ces fiches sont hors de votre périmètre");
    }

    await prisma.$transaction(async (tx) => {
      await moveDepartments(tx, sourceId, targetId);
      await movePlannings(tx, sourceId, targetId);
      await moveTaskAssignments(tx, sourceId, targetId);
      await moveAttendances(tx, sourceId, targetId);
      await moveDiscipleships(tx, sourceId, targetId);

      // ── Discipleship (en tant que FD et premier FD) ───────────────────────────
      await tx.discipleship.updateMany({ where: { discipleMakerId: sourceId }, data: { discipleMakerId: targetId } });
      await tx.discipleship.updateMany({ where: { firstMakerId: sourceId }, data: { firstMakerId: targetId } });

      // ── MemberLinkRequest ────────────────────────────────────────────────────
      await tx.memberLinkRequest.updateMany({ where: { memberId: sourceId }, data: { memberId: targetId } });

      await moveUserLink(tx, sourceId, targetId, srcChurchId, resolution.keepUserId);

      // ── Mettre à jour les champs scalaires du target ──────────────────────────
      await tx.member.update({
        where: { id: targetId },
        data: {
          firstName: resolution.firstName,
          lastName: resolution.lastName,
          ...(resolution.email !== undefined && { email: resolution.email }),
          ...(resolution.phone !== undefined && { phone: resolution.phone }),
        },
      });

      // ── Supprimer la source (cascade: MemberDepartment restants, etc.) ────────
      await tx.member.delete({ where: { id: sourceId } });
    });

    await logAudit({
      userId: session.user.id,
      churchId: srcChurchId,
      action: "DELETE",
      entityType: "Member",
      entityId: sourceId,
      details: { mergedInto: targetId, resolution },
    });

    return successResponse({ merged: true, targetId });
  } catch (error) {
    return errorResponse(error);
  }
}
