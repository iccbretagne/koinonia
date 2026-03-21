import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ ministryId: string }> }
) {
  try {
    const { ministryId } = await params;
    const churchId = await resolveChurchId("ministry", ministryId);
    const session = await requireChurchPermission("departments:manage", churchId);

    const existing = await prisma.ministry.findUnique({ where: { id: ministryId }, select: { isSystem: true } });
    if (!existing) throw new ApiError(404, "Ministère introuvable");
    if (existing.isSystem && !session.user.isSuperAdmin) {
      throw new ApiError(403, "Ce ministère système ne peut pas être modifié");
    }

    const body = await request.json();
    const data = updateSchema.parse(body);

    const ministry = await prisma.ministry.update({
      where: { id: ministryId },
      data,
      include: { church: { select: { id: true, name: true } } },
    });

    return successResponse(ministry);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ ministryId: string }> }
) {
  try {
    const { ministryId } = await params;
    const delChurchId = await resolveChurchId("ministry", ministryId);
    const session = await requireChurchPermission("departments:manage", delChurchId);

    const ministry = await prisma.ministry.findUnique({
      where: { id: ministryId },
      include: { departments: true },
    });

    if (!ministry) {
      throw new ApiError(404, "Ministère introuvable");
    }

    if (ministry.isSystem && !session.user.isSuperAdmin) {
      throw new ApiError(403, "Ce ministère système ne peut pas être supprimé");
    }

    if (ministry.departments.length > 0) {
      throw new ApiError(
        400,
        "Impossible de supprimer un ministère qui contient des départements"
      );
    }

    await prisma.ministry.delete({ where: { id: ministryId } });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
