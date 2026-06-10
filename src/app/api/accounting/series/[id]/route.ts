import { requirePermission, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const patchSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("accounting:submit");
    const { id } = await params;
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const series = await prisma.financialSeries.findUnique({ where: { id } });
    if (!series || series.churchId !== churchId) throw new ApiError(404, "Série introuvable");
    if (series.submittedById !== session.user.id!) throw new ApiError(403, "Accès refusé");

    const { status } = patchSchema.parse(await request.json());
    const updated = await prisma.financialSeries.update({ where: { id }, data: { status } });
    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
