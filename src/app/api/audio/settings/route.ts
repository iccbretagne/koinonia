/**
 * GET/PUT /api/audio/settings — configuration du module audio (couverture par défaut, template
 * de noms de séquences). Le département de captation audio se configure désormais via les
 * fonctions de département (`Department.function = "CAPTATION_AUDIO"`, spec 021).
 */
import { z } from "zod";
import { requireCurrentChurchPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse } from "@/lib/api-utils";

const schema = z.object({
  defaultCoverKey: z.string().nullable().optional(),
  sequenceTemplate: z.array(z.string().min(1)).optional(),
});

export async function GET() {
  try {
    const { churchId } = await requireCurrentChurchPermission("audio:manage");

    const settings = await prisma.audioSettings.findUnique({ where: { churchId } });
    return successResponse(settings);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { churchId } = await requireCurrentChurchPermission("audio:manage");

    const body = schema.parse(await request.json());

    const settings = await prisma.audioSettings.upsert({
      where: { churchId },
      create: {
        churchId,
        defaultCoverKey: body.defaultCoverKey,
        sequenceTemplate: body.sequenceTemplate,
      },
      update: {
        defaultCoverKey: body.defaultCoverKey,
        sequenceTemplate: body.sequenceTemplate,
      },
    });

    return successResponse(settings);
  } catch (error) {
    return errorResponse(error);
  }
}
