import { prisma } from "@/lib/prisma";
import { requireChurchPermission, getDiscipleshipScope } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  discipleMakerId: z.string(),
  firstMakerId: z.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { discipleMakerId, firstMakerId } = updateSchema.parse(await request.json());

    const existing = await prisma.discipleship.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Relation de discipolat introuvable");

    const session = await requireChurchPermission("discipleship:manage", existing.churchId);

    // DISCIPLE_MAKER ne peut modifier que ses propres disciples
    const scope = await getDiscipleshipScope(session, existing.churchId);
    if (scope.scoped && existing.discipleMakerId !== scope.memberId) {
      throw new ApiError(403, "Vous ne pouvez modifier que vos propres disciples");
    }

    // Seul un admin/secrétariat (non scopé) peut changer le premier FD
    if (firstMakerId && scope.scoped) {
      throw new ApiError(403, "Vous ne pouvez pas modifier le premier faiseur de disciples");
    }

    if (existing.discipleId === discipleMakerId) {
      throw new ApiError(400, "Un STAR ne peut pas être son propre FD");
    }
    if (firstMakerId && existing.discipleId === firstMakerId) {
      throw new ApiError(400, "Un STAR ne peut pas être son propre premier FD");
    }

    // Valider que les membres cibles appartiennent bien à cette église
    const idsToCheck = [discipleMakerId, ...(firstMakerId ? [firstMakerId] : [])];
    const validMembers = await prisma.member.findMany({
      where: { id: { in: idsToCheck }, departments: { some: { department: { ministry: { churchId: existing.churchId } } } } },
      select: { id: true },
    });
    if (validMembers.length !== new Set(idsToCheck).size) {
      throw new ApiError(400, "Un ou plusieurs membres n'appartiennent pas à cette église");
    }

    const updated = await prisma.discipleship.update({
      where: { id },
      data: {
        discipleMakerId,
        startedAt: new Date(),
        ...(firstMakerId ? { firstMakerId } : {}),
      },
      include: {
        disciple: { select: { id: true, firstName: true, lastName: true } },
        discipleMaker: { select: { id: true, firstName: true, lastName: true } },
        firstMaker: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await logAudit({ userId: session.user.id, churchId: existing.churchId, action: "UPDATE", entityType: "Discipleship", entityId: id, details: { discipleMakerId, ...(firstMakerId ? { firstMakerId } : {}) } });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await prisma.discipleship.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Relation de discipolat introuvable");

    const session = await requireChurchPermission("discipleship:manage", existing.churchId);

    // DISCIPLE_MAKER ne peut détacher que ses propres disciples
    const scope = await getDiscipleshipScope(session, existing.churchId);
    if (scope.scoped && existing.discipleMakerId !== scope.memberId) {
      throw new ApiError(403, "Vous ne pouvez détacher que vos propres disciples");
    }

    await prisma.discipleship.delete({ where: { id } });

    await logAudit({ userId: session.user.id, churchId: existing.churchId, action: "DELETE", entityType: "Discipleship", entityId: id });

    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
