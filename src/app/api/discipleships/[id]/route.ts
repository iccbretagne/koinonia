import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const updateSchema = z.object({
  discipleMakerId: z.string(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("discipleship:manage");
    const { id } = await params;
    const { discipleMakerId } = updateSchema.parse(await request.json());

    const existing = await prisma.discipleship.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Relation de discipolat introuvable");

    if (existing.discipleId === discipleMakerId) {
      throw new ApiError(400, "Un STAR ne peut pas être son propre FD");
    }

    // Changer le FD courant en conservant le firstMakerId d'origine
    const updated = await prisma.discipleship.update({
      where: { id },
      data: { discipleMakerId, startedAt: new Date() },
      include: {
        disciple: { select: { id: true, firstName: true, lastName: true } },
        discipleMaker: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "UPDATE_DISCIPLESHIP",
        entityType: "Discipleship",
        entityId: id,
        churchId: existing.churchId,
      },
    });

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
    const session = await requirePermission("discipleship:manage");
    const { id } = await params;

    const existing = await prisma.discipleship.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Relation de discipolat introuvable");

    await prisma.discipleship.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "DELETE_DISCIPLESHIP",
        entityType: "Discipleship",
        entityId: id,
        churchId: existing.churchId,
      },
    });

    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
