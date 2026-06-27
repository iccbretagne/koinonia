import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireAuth } from "@/lib/auth";
import {
  hasMsdpManagementAccess,
  msdpPatchSchema,
  computeMsdpTransitionData,
  notifyMsdpCounselorAssigned,
} from "@/modules/integration";
import { logAudit } from "@/lib/audit";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const followUp = await prisma.msdpFollowUp.findUnique({
      where: { id },
      include: {
        assignedConseillerMsdp: { select: { id: true, name: true, email: true } },
      },
    });
    if (!followUp) throw new ApiError(404, "Suivi MSDP introuvable");

    const session = await requireAuth();
    const isManager = await hasMsdpManagementAccess(session, followUp.churchId);
    const isCounselor = session.user.id === followUp.assignedConseillerMsdpId;
    if (!isManager && !isCounselor) throw new ApiError(403, "Accès refusé");

    return successResponse(followUp);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const followUp = await prisma.msdpFollowUp.findUnique({
      where: { id },
      select: {
        id: true,
        churchId: true,
        requestId: true,
        status: true,
        assignedConseillerMsdpId: true,
      },
    });
    if (!followUp) throw new ApiError(404, "Suivi MSDP introuvable");

    const session = await requireAuth();
    const isManager = await hasMsdpManagementAccess(session, followUp.churchId);
    const isCounselor = session.user.id === followUp.assignedConseillerMsdpId;
    if (!isManager && !isCounselor) throw new ApiError(403, "Accès refusé");

    const body = msdpPatchSchema.parse(await request.json());
    const now = new Date();

    const managerOnly = ["assign_counselor", "reopen"];
    if (managerOnly.includes(body.action) && !isManager)
      throw new ApiError(403, "Cette action est réservée aux membres de l'équipe intégration");

    const updateData = computeMsdpTransitionData(followUp, body, now);

    const updated = await prisma.msdpFollowUp.update({
      where: { id },
      data: updateData,
      include: {
        assignedConseillerMsdp: { select: { id: true, name: true, email: true } },
      },
    });

    await logAudit({
      userId: session.user.id,
      churchId: followUp.churchId,
      action: "UPDATE",
      entityType: "MsdpFollowUp",
      entityId: id,
      details: { action: body.action },
    });

    if (body.action === "assign_counselor") {
      const integrationReq = await prisma.familyIntegrationRequest.findUnique({
        where: { id: followUp.requestId },
        select: { firstName: true, lastName: true },
      });
      if (integrationReq) {
        notifyMsdpCounselorAssigned({
          counselorId: body.counselorId,
          followUpId: id,
          personName: `${integrationReq.firstName} ${integrationReq.lastName}`,
        });
      }
    }

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
