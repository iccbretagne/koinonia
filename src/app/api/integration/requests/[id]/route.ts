import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { countCareItemsFromIntegrationRequest } from "@/modules/care";
import {
  requireIntegrationAccess,
  notifyBergerAssigned,
  notifyBergerUnassigned,
  notifyIntegrationTeamHandback,
  familyPatchSchema,
  computeFamilyTransitionData,
  computeReopenData,
  assertNoStaleAssignment,
  recordStatusChange,
  getRequestHistory,
  ABANDON_REASON_LABELS,
  requireIntegrationDelete,
  deleteIntegrationRequest,
} from "@/modules/integration";
import type { FamilyPatchBody } from "@/modules/integration";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const req = await prisma.familyIntegrationRequest.findUnique({
      where: { id },
      include: {
        assignedBerger: { select: { id: true, name: true, email: true } },
        member: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!req) throw new ApiError(404, "Demande introuvable");

    const { scope } = await requireIntegrationAccess(req.churchId);

    if (scope.scoped && req.assignedFamilyId && !scope.familyIds.includes(req.assignedFamilyId))
      throw new ApiError(403, "Accès refusé");

    return successResponse(req);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Précision portée par l'historique : note d'attente/relance, raison de renvoi, motif d'abandon. */
function historyNote(body: FamilyPatchBody): string | null {
  switch (body.action) {
    case "wait":
    case "relance":
      return body.note ?? null;
    case "handback":
      return body.reason;
    case "abandon":
      return body.abandonReason
        ? `${ABANDON_REASON_LABELS[body.abandonReasonCode]} — ${body.abandonReason}`
        : ABANDON_REASON_LABELS[body.abandonReasonCode];
    default:
      return null;
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const req = await prisma.familyIntegrationRequest.findUnique({
      where: { id },
      select: {
        id: true,
        churchId: true,
        status: true,
        firstName: true,
        lastName: true,
        assignedFamilyId: true,
        assignedFamilyName: true,
        assignedBergerId: true,
        assignedAt: true,
        contactedAt: true,
        whatsappAddedAt: true,
        waitingFrom: true,
      },
    });
    if (!req) throw new ApiError(404, "Demande introuvable");

    const { session, scope } = await requireIntegrationAccess(req.churchId);

    if (scope.scoped && req.assignedFamilyId && !scope.familyIds.includes(req.assignedFamilyId))
      throw new ApiError(403, "Accès refusé");

    const actor = {
      isIntegrationMember: !scope.scoped,
      isAssignedBerger: req.assignedBergerId === session.user.id,
    };

    const body = familyPatchSchema.parse(await request.json());
    const now = new Date();

    const transition =
      body.action === "reopen"
        ? computeReopenData(req, body.mode, await getRequestHistory(id), actor)
        : computeFamilyTransitionData(req, body, actor, now);

    assertNoStaleAssignment({
      status: (transition.data.status as string | undefined) ?? req.status,
      assignedFamilyId:
        "assignedFamilyId" in transition.data
          ? (transition.data.assignedFamilyId as number | null)
          : req.assignedFamilyId,
      assignedBergerId:
        "assignedBergerId" in transition.data
          ? (transition.data.assignedBergerId as string | null)
          : req.assignedBergerId,
    });

    const updated = await prisma.familyIntegrationRequest.update({
      where: { id },
      data: transition.data,
      include: {
        assignedBerger: { select: { id: true, name: true, email: true } },
      },
    });

    await recordStatusChange({
      userId: session.user.id,
      churchId: req.churchId,
      requestId: id,
      action: body.action,
      from: req.status,
      to: updated.status,
      note: historyNote(body),
    });

    if (body.action === "handback") {
      await notifyIntegrationTeamHandback({
        churchId: req.churchId,
        requestId: id,
        firstName: req.firstName,
        lastName: req.lastName,
        bergerName: session.user.name ?? null,
        reason: body.reason,
      });
    }

    if (transition.notifyUnassignedBergerId) {
      await notifyBergerUnassigned({
        bergerId: transition.notifyUnassignedBergerId,
        requestId: id,
        firstName: req.firstName,
        lastName: req.lastName,
      });
    }

    // Notifier le berger à l'affectation
    if (transition.notifyAssignedBergerId) {
      const appUrl = process.env.APP_URL ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      await notifyBergerAssigned({
        bergerId: transition.notifyAssignedBergerId,
        firstName: req.firstName,
        lastName: req.lastName,
        requestId: id,
        familyName: updated.assignedFamilyName,
        appUrl,
      });
    }

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Suppression définitive (spec 057) — `integration:delete`, dans l'église de la demande.
 * Refusée tant qu'un rendez-vous ou un suivi `care` en est issu : `care` et `integration` ne
 * s'importent pas (ADR-0001), le contrôle et la suppression sont donc composés ici, dans une
 * même transaction.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;
    const req = await prisma.familyIntegrationRequest.findUnique({
      where: { id },
      select: { churchId: true },
    });
    if (!req) throw new ApiError(404, "Demande introuvable");
    const session = await requireIntegrationDelete(req.churchId);

    await prisma.$transaction(async (tx) => {
      if ((await countCareItemsFromIntegrationRequest(tx, id)) > 0) {
        throw new ApiError(
          409,
          "Cette demande a donné lieu à une demande de rendez-vous pastoral et/ou à un suivi de nouveau converti : supprimez-les d'abord."
        );
      }
      await deleteIntegrationRequest(tx, { id, churchId: req.churchId });
    });

    await logAudit({
      userId: session.user.id!,
      churchId: req.churchId,
      action: "DELETE",
      entityType: "FamilyIntegrationRequest",
      entityId: id,
    });

    return successResponse({ id });
  } catch (error) {
    return errorResponse(error);
  }
}
