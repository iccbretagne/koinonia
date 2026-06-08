import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireAuth } from "@/lib/auth";
import { isMsdpMember, isIntegrationMember } from "@/modules/integration";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const createSchema = z.object({
  requestId: z.string().min(1),
  churchId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await request.json());
    const session = await requireAuth();

    const canCreate =
      session.user.isSuperAdmin ||
      (await isIntegrationMember(session, body.churchId)) ||
      (await isMsdpMember(session, body.churchId));

    if (!canCreate)
      throw new ApiError(403, "Seule l'équipe intégration ou MSDP peut créer un suivi MSDP");

    const req = await prisma.familyIntegrationRequest.findUnique({
      where: { id: body.requestId },
      select: { id: true, churchId: true, salvationCall: true, msdpFollowUp: { select: { id: true } } },
    });
    if (!req || req.churchId !== body.churchId) throw new ApiError(404, "Demande introuvable");
    if (!req.salvationCall)
      throw new ApiError(400, "Cette demande n'est pas liée à un appel au salut");
    if (req.msdpFollowUp) throw new ApiError(409, "Un suivi MSDP existe déjà pour cette demande");

    const followUp = await prisma.msdpFollowUp.create({
      data: {
        churchId: body.churchId,
        requestId: body.requestId,
        status: "SUBMITTED",
      },
      include: {
        assignedConseillerMsdp: { select: { id: true, name: true, email: true } },
      },
    });

    await logAudit({
      userId: session.user.id,
      churchId: body.churchId,
      action: "CREATE",
      entityType: "MsdpFollowUp",
      entityId: followUp.id,
      details: { requestId: body.requestId },
    });

    return successResponse(followUp, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
