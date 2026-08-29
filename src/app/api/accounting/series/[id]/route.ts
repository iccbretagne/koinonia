import { requireChurchPermission } from "@/lib/auth";
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
    const { id } = await params;

    // L'église de l'objet fait autorité, pas le contexte affiché : on résout d'abord la
    // série puis on vérifie la permission dans SON église, pour qu'un contexte manipulé
    // ne puisse jamais déplacer l'action vers une autre église.
    const series = await prisma.financialSeries.findUnique({ where: { id } });
    if (!series) throw new ApiError(404, "Série introuvable");

    const session = await requireChurchPermission("accounting:submit", series.churchId);
    if (series.submittedById !== session.user.id!) throw new ApiError(403, "Accès refusé");

    const { status } = patchSchema.parse(await request.json());
    const updated = await prisma.financialSeries.update({ where: { id }, data: { status } });
    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
