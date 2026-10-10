import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { rolePermissions } from "@/lib/registry";
import { executeRequest, planningBus, sendEventChangeNotices, type EventChangeNotices } from "@/modules/planning";
import { createNotification } from "@/lib/notifications";
import { functionForRequestType } from "@/lib/department-functions";
import { isMemberOfFunction, getFunctionDepartmentsMap } from "@/lib/function-departments";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

const EXECUTABLE_TYPES = new Set([
  "AJOUT_EVENEMENT",
  "MODIFICATION_EVENEMENT",
  "ANNULATION_EVENEMENT",
  "MODIFICATION_PLANNING",
  "DEMANDE_ACCES",
]);

const patchSchema = z.object({
  status: z.enum(["EN_ATTENTE", "EN_COURS", "LIVRE", "ANNULE", "APPROUVEE", "REFUSEE"]).optional(),
  reviewNotes: z.string().nullable().optional(),
  // Owner-editable fields (when request is EN_ATTENTE)
  title: z.string().min(1).optional(),
  payload: z.record(z.unknown()).optional(),
  // Payload fields update (for announcement-type requests)
  deliveryLink: z.string().nullable().optional(),
  format: z.string().nullable().optional(),
  brief: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  // Statut attendu par l'interface (spec 063) : refus si la demande a changé entre-temps.
  expectedStatus: z
    .enum(["EN_ATTENTE", "EN_COURS", "APPROUVEE", "EXECUTEE", "LIVRE", "REFUSEE", "ANNULE", "ERREUR"])
    .optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Resolve churchId + ownership without a full join
    const minimal = await prisma.request.findUnique({
      where: { id },
      select: { churchId: true, submittedById: true, type: true },
    });
    if (!minimal) throw new ApiError(404, "Demande introuvable");

    const session = await requireChurchPermission("members:view", minimal.churchId);

    const userPermissions = new Set(
      session.user.churchRoles
        .filter((r) => r.churchId === minimal.churchId)
        .flatMap((r) => rolePermissions[r.role] ?? [])
    );
    const canManage = session.user.isSuperAdmin || userPermissions.has("events:manage");
    const userDeptIds = session.user.churchRoles
      .filter((r) => r.churchId === minimal.churchId)
      .flatMap((r) => r.departments.map((d) => d.department.id));

    const isOwner = minimal.submittedById === session.user.id;
    const isAssignedFunctionMember = await isMemberOfFunction(
      userDeptIds,
      minimal.churchId,
      functionForRequestType(minimal.type)
    );

    if (!canManage && !isAssignedFunctionMember && !isOwner) {
      throw new ApiError(403, "Accès refusé");
    }

    const req = await prisma.request.findUnique({
      where: { id },
      include: {
        submittedBy: { select: { id: true, name: true, displayName: true } },
        department: { select: { id: true, name: true } },
        ministry: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true, displayName: true } },
        announcement: {
          select: {
            id: true,
            title: true,
            content: true,
            eventDate: true,
            isSaveTheDate: true,
            isUrgent: true,
            channelInterne: true,
            channelExterne: true,
            targetEvents: {
              select: {
                eventId: true,
              },
            },
          },
        },
        parentRequest: {
          select: { id: true, type: true, status: true },
        },
        childRequests: true,
      },
    });
    if (!req) throw new ApiError(404, "Demande introuvable");

    const fnsNeeded = Array.from(
      new Set([req.type, ...req.childRequests.map((c) => c.type)].map(functionForRequestType))
    );
    const deptsByFn = await getFunctionDepartmentsMap(minimal.churchId, fnsNeeded);

    return successResponse({
      ...req,
      assignedFunction: functionForRequestType(req.type),
      assignedDepts: deptsByFn.get(functionForRequestType(req.type)) ?? [],
      childRequests: req.childRequests.map((c) => ({
        ...c,
        assignedFunction: functionForRequestType(c.type),
        assignedDepts: deptsByFn.get(functionForRequestType(c.type)) ?? [],
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

type PatchData = z.infer<typeof patchSchema>;
type PatchTx = Prisma.TransactionClient;

interface PatchActor {
  userId: string;
  canManage: boolean;
  isAssignedDeptMember: boolean;
  isOwner: boolean;
}

interface ExistingRequest {
  id: string;
  submittedById: string | null;
  churchId: string;
  type: string;
  status: string;
  title: string;
  announcementId: string | null;
  payload: Prisma.JsonValue;
}

const PARENT_TYPES = new Set(["DIFFUSION_INTERNE", "RESEAUX_SOCIAUX"]);

/** Droits d'édition : le demandeur seul n'annule ou ne corrige que sa demande en attente. */
function assertPatchAllowed(data: PatchData, actor: PatchActor, isPending: boolean) {
  const handles = actor.canManage || actor.isAssignedDeptMember;
  if (actor.isOwner && !handles) {
    // Owner can only edit their own pending requests
    if (!isPending) {
      throw new ApiError(403, "Le demandeur ne peut modifier que ses demandes en attente");
    }
    // Owner can only change status to ANNULE
    if (data.status !== undefined && data.status !== "ANNULE") {
      throw new ApiError(403, "Le demandeur ne peut qu'annuler sa propre demande");
    }
    // Owner cannot set reviewNotes
    if (data.reviewNotes !== undefined) {
      throw new ApiError(403, "Le demandeur ne peut pas ajouter de notes de révision");
    }
  }
  if (data.status !== undefined && data.status !== "ANNULE" && !handles) {
    throw new ApiError(403, "Seuls les membres du département assigné peuvent modifier le statut");
  }
  // Refusal requires a note
  if (data.status === "REFUSEE" && !data.reviewNotes?.trim()) {
    throw new ApiError(400, "Une note est obligatoire pour refuser une demande");
  }
  // Annulation par l'équipe qui traite : motif obligatoire, transmis au demandeur (spec 063).
  // Le demandeur annulant sa propre demande en attente en reste dispensé.
  if (data.status === "ANNULE" && !actor.isOwner && !data.reviewNotes?.trim()) {
    throw new ApiError(400, "Un motif est obligatoire pour annuler une demande");
  }
}

/** Payload fusionné avec les champs modifiés, ou `undefined` s'il ne change pas. */
function mergedPayloadFor(data: PatchData, currentPayload: Record<string, unknown>) {
  const payloadUpdates: Record<string, unknown> = {};
  for (const key of ["deliveryLink", "format", "brief", "deadline"] as const) {
    if (data[key] !== undefined) payloadUpdates[key] = data[key];
  }
  // Owner payload update (full payload object merge)
  if (data.payload !== undefined) Object.assign(payloadUpdates, data.payload);
  return Object.keys(payloadUpdates).length > 0 ? { ...currentPayload, ...payloadUpdates } : undefined;
}

/** Statut d'une annonce d'après ceux de ses demandes de diffusion. */
function announcementStatusFor(statuses: string[]): "EN_ATTENTE" | "EN_COURS" | "TRAITEE" | "ANNULEE" {
  if (statuses.every((s) => s === "ANNULE")) return "ANNULEE";
  if (statuses.every((s) => s === "LIVRE" || s === "ANNULE")) return "TRAITEE";
  if (statuses.some((s) => s === "EN_COURS" || s === "LIVRE")) return "EN_COURS";
  return "EN_ATTENTE";
}

async function syncAnnouncementStatus(tx: PatchTx, announcementId: string, requestId: string, status: string) {
  const siblingStatuses = await tx.request.findMany({
    where: { announcementId, parentRequestId: null, id: { not: requestId } },
    select: { status: true },
  });
  await tx.announcement.update({
    where: { id: announcementId },
    data: { status: announcementStatusFor([status, ...siblingStatuses.map((s) => s.status)]) },
  });
}

/** Approbation d'un type exécutable : exécution automatique, puis statut EXECUTEE ou ERREUR. */
async function approveExecutable(
  tx: PatchTx,
  existing: ExistingRequest,
  data: PatchData,
  payload: Record<string, unknown>,
  userId: string
) {
  const execResult = await executeRequest(tx, existing.id, existing.churchId, existing.type, payload, userId);
  const result = await tx.request.update({
    where: { id: existing.id },
    data: {
      status: execResult.success ? "EXECUTEE" : "ERREUR",
      reviewedBy: { connect: { id: userId } },
      reviewedAt: new Date(),
      ...(data.reviewNotes !== undefined && { reviewNotes: data.reviewNotes }),
      ...(execResult.success && { executedAt: new Date() }),
      ...(!execResult.success && { executionError: execResult.error }),
    },
    select: { id: true, type: true, status: true, executionError: true },
  });
  return { result, notices: execResult.notices };
}

/** Mise à jour ordinaire, avec ses effets : annulation en cascade, statut de l'annonce, bus. */
async function applyUpdate(
  tx: PatchTx,
  existing: ExistingRequest,
  data: PatchData,
  mergedPayload: Record<string, unknown> | undefined,
  userId: string
) {
  const id = existing.id;
  const result = await tx.request.update({
    where: { id },
    data: {
      ...(data.status && { status: data.status }),
      ...(data.title !== undefined && { title: data.title }),
      ...(data.reviewNotes !== undefined && { reviewNotes: data.reviewNotes }),
      ...(mergedPayload && { payload: mergedPayload as Prisma.InputJsonValue }),
      ...(data.status !== undefined && {
        reviewedBy: { connect: { id: userId } },
        reviewedAt: new Date(),
      }),
    },
    select: { id: true, type: true, status: true },
  });
  const isParent = PARENT_TYPES.has(result.type);

  // Cascade cancellation: when parent request is cancelled, cancel children
  if (data.status === "ANNULE" && isParent) {
    await tx.request.updateMany({ where: { parentRequestId: id }, data: { status: "ANNULE" } });
  }
  if (data.status !== undefined) {
    await propagateStatusChange(tx, existing, data.status, isParent, userId);
  }
  return result;
}

/** Changement de statut : statut de l'annonce liée (demande parente) puis événement du bus. */
async function propagateStatusChange(
  tx: PatchTx,
  existing: ExistingRequest,
  newStatus: NonNullable<PatchData["status"]>,
  isParent: boolean,
  userId: string
) {
  // Sync announcement status when a parent request changes status
  if (existing.announcementId && isParent) {
    await syncAnnouncementStatus(tx, existing.announcementId, existing.id, newStatus);
  }
  // Emit status_changed event for cross-module integrations (e.g. media module)
  await planningBus.emit(
    "planning:request:status_changed",
    { tx, churchId: existing.churchId, userId },
    {
      requestId: existing.id,
      requestType: existing.type,
      churchId: existing.churchId,
      oldStatus: existing.status,
      newStatus,
      updatedById: userId,
      title: existing.title,
      payload: (existing.payload as Record<string, unknown>) ?? {},
    }
  );
}

/** Prévient le demandeur de l'approbation, du refus ou de l'annulation (pas s'il s'agit de lui-même). */
function notifySubmitter(existing: ExistingRequest, data: PatchData, updatedStatus: string, userId: string) {
  if (!existing.submittedById || existing.submittedById === userId) return;
  if (data.status === "APPROUVEE" || updatedStatus === "EXECUTEE") {
    createNotification({
      userId: existing.submittedById,
      domain: "requests",
      type: "REQUEST_APPROVED",
      title: "Demande approuvée",
      message: `Votre demande « ${existing.title} » a été approuvée.`,
      link: `/requests`,
    }).catch(() => {});
  } else if (data.status === "ANNULE") {
    createNotification({
      userId: existing.submittedById,
      domain: "requests",
      type: "REQUEST_CANCELLED",
      title: "Demande annulée",
      message: `Votre demande « ${existing.title} » a été annulée.${data.reviewNotes ? ` Motif : ${data.reviewNotes}` : ""}`,
      link: `/requests`,
    }).catch(() => {});
  } else if (data.status === "REFUSEE") {
    const rejectionReason = data.reviewNotes ? ` Motif : ${data.reviewNotes}` : "";
    createNotification({
      userId: existing.submittedById,
      domain: "requests",
      type: "REQUEST_REJECTED",
      title: "Demande refusée",
      message: `Votre demande « ${existing.title} » a été refusée.${rejectionReason}`,
      link: `/requests`,
    }).catch(() => {});
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await prisma.request.findUnique({
      where: { id },
      select: {
        id: true,
        submittedById: true,
        churchId: true,
        type: true,
        status: true,
        title: true,
        announcementId: true,
        payload: true,
      },
    });
    if (!existing) throw new ApiError(404, "Demande introuvable");

    const session = await requireChurchPermission("members:view", existing.churchId);
    const churchRoles = session.user.churchRoles.filter((r) => r.churchId === existing.churchId);
    const userPermissions = new Set(churchRoles.flatMap((r) => rolePermissions[r.role] ?? []));
    const actor: PatchActor = {
      userId: session.user.id,
      canManage: session.user.isSuperAdmin || userPermissions.has("events:manage"),
      isAssignedDeptMember: await isMemberOfFunction(
        churchRoles.flatMap((r) => r.departments.map((d) => d.department.id)),
        existing.churchId,
        functionForRequestType(existing.type)
      ),
      isOwner: existing.submittedById === session.user.id,
    };
    if (!actor.canManage && !actor.isAssignedDeptMember && !actor.isOwner) {
      throw new ApiError(403, "Accès refusé");
    }

    const data = patchSchema.parse(await request.json());
    assertPatchAllowed(data, actor, existing.status === "EN_ATTENTE");

    const currentPayload = (existing.payload as Record<string, unknown>) ?? {};
    const mergedPayload = mergedPayloadFor(data, currentPayload);

    // Notifications de changement d'événement (spec 059), envoyées après le commit.
    let eventNotices: EventChangeNotices | undefined;
    const updated = await prisma.$transaction(async (tx) => {
      if (data.expectedStatus !== undefined) {
        const current = await tx.request.findUnique({ where: { id }, select: { status: true } });
        if (current?.status !== data.expectedStatus) {
          throw new ApiError(409, "Cette demande a été modifiée entre-temps");
        }
      }
      // For executable types approved → run auto-execution, using the effective payload
      // (merged updates take precedence over stored payload).
      if (data.status === "APPROUVEE" && EXECUTABLE_TYPES.has(existing.type)) {
        const approved = await approveExecutable(tx, existing, data, mergedPayload ?? currentPayload, actor.userId);
        eventNotices = approved.notices;
        return approved.result;
      }
      return applyUpdate(tx, existing, data, mergedPayload, actor.userId);
    });

    const { notified } = eventNotices ? await sendEventChangeNotices(eventNotices) : { notified: 0 };

    await logAudit({ userId: session.user.id, churchId: existing.churchId, action: "UPDATE", entityType: "Request", entityId: id, details: { status: data.status, type: existing.type } });

    notifySubmitter(existing, data, updated.status, session.user.id);

    return successResponse({ ...updated, notified });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await prisma.request.findUnique({
      where: { id },
      select: { churchId: true, type: true },
    });
    if (!existing) throw new ApiError(404, "Demande introuvable");

    const session = await requireChurchPermission("events:manage", existing.churchId);

    await prisma.request.delete({ where: { id } });

    await logAudit({
      userId: session.user.id,
      churchId: existing.churchId,
      action: "DELETE",
      entityType: "Request",
      entityId: id,
      details: { type: existing.type },
    });

    return successResponse({ deleted: id });
  } catch (error) {
    return errorResponse(error);
  }
}
