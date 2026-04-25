import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  resolution: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    // userId du compte à conserver si les deux ont un lien ; null = garder celui du target
    keepUserId: z.string().nullable().optional(),
  }),
});

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

    await prisma.$transaction(async (tx) => {
      // ── Départements ──────────────────────────────────────────────────────────
      const sourceDepts = await tx.memberDepartment.findMany({ where: { memberId: sourceId } });
      const targetDeptIds = new Set(
        (await tx.memberDepartment.findMany({ where: { memberId: targetId } })).map((d) => d.departmentId)
      );
      for (const sd of sourceDepts) {
        if (!targetDeptIds.has(sd.departmentId)) {
          await tx.memberDepartment.update({
            where: { id: sd.id },
            data: { memberId: targetId },
          });
        }
        // else: doublon → sera supprimé via cascade sur la source
      }

      // ── Planning ──────────────────────────────────────────────────────────────
      await tx.planning.updateMany({ where: { memberId: sourceId }, data: { memberId: targetId } });

      // ── TaskAssignment ────────────────────────────────────────────────────────
      // Unique constraint: (taskId, eventId, memberId) — dédupliquer
      const srcTasks = await tx.taskAssignment.findMany({ where: { memberId: sourceId } });
      for (const t of srcTasks) {
        const conflict = await tx.taskAssignment.findFirst({
          where: { taskId: t.taskId, eventId: t.eventId, memberId: targetId },
        });
        if (!conflict) {
          await tx.taskAssignment.update({ where: { id: t.id }, data: { memberId: targetId } });
        }
      }

      // ── DiscipleshipAttendance ────────────────────────────────────────────────
      const srcAttendances = await tx.discipleshipAttendance.findMany({ where: { memberId: sourceId } });
      for (const a of srcAttendances) {
        const conflict = await tx.discipleshipAttendance.findFirst({
          where: { memberId: targetId, eventId: a.eventId },
        });
        if (!conflict) {
          await tx.discipleshipAttendance.update({ where: { id: a.id }, data: { memberId: targetId } });
        }
      }

      // ── Discipleship (en tant que disciple) ───────────────────────────────────
      const srcDiscipleships = await tx.discipleship.findMany({ where: { discipleId: sourceId } });
      for (const d of srcDiscipleships) {
        const conflict = await tx.discipleship.findFirst({
          where: { discipleId: targetId, churchId: d.churchId },
        });
        if (!conflict) {
          await tx.discipleship.update({ where: { id: d.id }, data: { discipleId: targetId } });
        }
        // else: target a déjà un FD dans cette église → on laisse tomber la relation source
      }

      // ── Discipleship (en tant que FD et premier FD) ───────────────────────────
      await tx.discipleship.updateMany({ where: { discipleMakerId: sourceId }, data: { discipleMakerId: targetId } });
      await tx.discipleship.updateMany({ where: { firstMakerId: sourceId }, data: { firstMakerId: targetId } });

      // ── MemberLinkRequest ────────────────────────────────────────────────────
      await tx.memberLinkRequest.updateMany({ where: { memberId: sourceId }, data: { memberId: targetId } });

      // ── MemberUserLink ────────────────────────────────────────────────────────
      const srcLink = await tx.memberUserLink.findUnique({ where: { memberId: sourceId } });
      const tgtLink = await tx.memberUserLink.findUnique({ where: { memberId: targetId } });

      if (srcLink && tgtLink) {
        // Les deux ont un compte lié — garder celui choisi, supprimer l'autre
        const userIdToRemove = resolution.keepUserId === srcLink.userId ? tgtLink.userId : srcLink.userId;
        const memberIdToRemove = userIdToRemove === srcLink.userId ? sourceId : targetId;
        await tx.memberUserLink.delete({ where: { memberId: memberIdToRemove } });
        // Déplacer le lien source vers le target si c'est le lien source qu'on conserve
        if (resolution.keepUserId === srcLink.userId) {
          await tx.memberUserLink.update({ where: { memberId: sourceId }, data: { memberId: targetId } });
        }
      } else if (srcLink && !tgtLink) {
        await tx.memberUserLink.update({ where: { memberId: sourceId }, data: { memberId: targetId } });
      }
      // else: tgtLink && !srcLink → rien à faire (target garde son lien)

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
