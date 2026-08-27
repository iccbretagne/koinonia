/**
 * GET/PUT /api/audio/settings — configuration du module audio (département de captation,
 * couverture par défaut, template de noms de séquences).
 */
import { z } from "zod";
import { requirePermission, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

const schema = z.object({
  captureDepartmentId: z.string().nullable().optional(),
  defaultCoverKey: z.string().nullable().optional(),
  sequenceTemplate: z.array(z.string().min(1)).optional(),
});

export async function GET() {
  try {
    const session = await requirePermission("audio:manage");
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const settings = await prisma.audioSettings.findUnique({ where: { churchId } });
    return successResponse(settings);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requirePermission("audio:manage");
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const body = schema.parse(await request.json());

    if (body.captureDepartmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: body.captureDepartmentId, ministry: { churchId } },
      });
      if (!dept) throw new ApiError(404, "Département introuvable");
    }

    const settings = await prisma.audioSettings.upsert({
      where: { churchId },
      create: {
        churchId,
        captureDepartmentId: body.captureDepartmentId,
        defaultCoverKey: body.defaultCoverKey,
        sequenceTemplate: body.sequenceTemplate,
      },
      update: {
        captureDepartmentId: body.captureDepartmentId,
        defaultCoverKey: body.defaultCoverKey,
        sequenceTemplate: body.sequenceTemplate,
      },
    });

    return successResponse(settings);
  } catch (error) {
    return errorResponse(error);
  }
}
