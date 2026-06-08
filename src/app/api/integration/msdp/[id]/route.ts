import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireAuth } from "@/lib/auth";
import { isIntegrationMember, isMsdpMember } from "@/modules/integration";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import type { Session } from "next-auth";

async function hasManagementAccess(session: Session, churchId: string): Promise<boolean> {
  if (session.user.isSuperAdmin) return true;
  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  if (roles.length > 0) {
    const { rolePermissions } = await import("@/lib/registry");
    const perms = new Set(roles.flatMap((r) => rolePermissions[r.role] ?? []));
    if (perms.has("members:manage") || perms.has("events:manage")) return true;
  }
  if (await isIntegrationMember(session, churchId)) return true;
  return isMsdpMember(session, churchId);
}

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
    const isManager = await hasManagementAccess(session, followUp.churchId);
    const isCounselor = session.user.id === followUp.assignedConseillerMsdpId;
    if (!isManager && !isCounselor) throw new ApiError(403, "Accès refusé");

    return successResponse(followUp);
  } catch (error) {
    return errorResponse(error);
  }
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign_counselor"),
    counselorId: z.string().min(1),
  }),
  z.object({ action: z.literal("contact") }),
  z.object({ action: z.literal("in_formation") }),
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("abandon") }),
  z.object({ action: z.literal("reopen") }),
  z.object({
    action: z.literal("note"),
    notes: z.string().max(10000),
  }),
]);

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
    const isManager = await hasManagementAccess(session, followUp.churchId);
    const isCounselor = session.user.id === followUp.assignedConseillerMsdpId;
    if (!isManager && !isCounselor) throw new ApiError(403, "Accès refusé");

    const body = patchSchema.parse(await request.json());
    const now = new Date();

    const managerOnly = ["assign_counselor", "reopen"];
    if (managerOnly.includes(body.action) && !isManager)
      throw new ApiError(403, "Cette action est réservée aux membres de l'équipe intégration");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let updateData: Record<string, any> = {};

    switch (body.action) {
      case "assign_counselor":
        updateData = {
          status: "ASSIGNED",
          assignedConseillerMsdpId: body.counselorId,
          assignedAt: now,
        };
        break;

      case "contact":
        if (followUp.status !== "ASSIGNED")
          throw new ApiError(400, "Transition invalide : le suivi doit être ASSIGNED");
        updateData = { status: "CONTACTED", contactedAt: now };
        break;

      case "in_formation":
        if (followUp.status !== "CONTACTED")
          throw new ApiError(400, "Transition invalide : le suivi doit être CONTACTED");
        updateData = { status: "IN_FORMATION", inFormationAt: now };
        break;

      case "complete":
        if (followUp.status !== "IN_FORMATION")
          throw new ApiError(400, "Transition invalide : le suivi doit être IN_FORMATION");
        updateData = { status: "COMPLETED", completedAt: now };
        break;

      case "abandon":
        if (followUp.status === "COMPLETED")
          throw new ApiError(400, "Impossible d'abandonner un suivi terminé");
        updateData = { status: "ABANDONED", abandonedAt: now };
        break;

      case "reopen":
        if (followUp.status !== "ABANDONED")
          throw new ApiError(400, "Seul un suivi abandonné peut être rouvert");
        updateData = { status: "SUBMITTED", abandonedAt: null };
        break;

      case "note":
        updateData = { notes: body.notes };
        break;
    }

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

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
