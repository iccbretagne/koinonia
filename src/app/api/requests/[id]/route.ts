import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { executeRequest } from "@/lib/request-executor";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

const EXECUTABLE_TYPES = [
  "AJOUT_EVENEMENT",
  "MODIFICATION_EVENEMENT",
  "ANNULATION_EVENEMENT",
  "MODIFICATION_PLANNING",
  "DEMANDE_ACCES",
];

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
      select: { churchId: true, submittedById: true, assignedDeptId: true },
    });
    if (!minimal) throw new ApiError(404, "Demande introuvable");

    const session = await requireChurchPermission("planning:view", minimal.churchId);

    const userPermissions = new Set(
      session.user.churchRoles
        .filter((r) => r.churchId === minimal.churchId)
        .flatMap((r) => hasPermission(r.role))
    );
    const canManage = session.user.isSuperAdmin || userPermissions.has("events:manage");
    const userDeptIds = session.user.churchRoles
      .filter((r) => r.churchId === minimal.churchId)
      .flatMap((r) => r.departments.map((d) => d.department.id));

    const isOwner = minimal.submittedById === session.user.id;
    const isAssignedDeptMember =
      minimal.assignedDeptId !== null && userDeptIds.includes(minimal.assignedDeptId);

    if (!canManage && !isAssignedDeptMember && !isOwner) {
      throw new ApiError(403, "Accès refusé");
    }

    const req = await prisma.request.findUnique({
      where: { id },
      include: {
        submittedBy: { select: { id: true, name: true, displayName: true } },
        department: { select: { id: true, name: true } },
        ministry: { select: { id: true, name: true } },
        assignedDept: { select: { id: true, name: true } },
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
        childRequests: {
          include: {
            assignedDept: { select: { id: true, name: true } },
          },
        },
      },
    });

    return successResponse(req);
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

    const existing = await prisma.request.findUnique({
      where: { id },
      select: {
        id: true,
        submittedById: true,
        assignedDeptId: true,
        churchId: true,
        type: true,
        status: true,
        announcementId: true,
        payload: true,
      },
    });
    if (!existing) throw new ApiError(404, "Demande introuvable");

    const session = await requireChurchPermission("planning:view", existing.churchId);

    const userPermissions = new Set(
      session.user.churchRoles
        .filter((r) => r.churchId === existing.churchId)
        .flatMap((r) => hasPermission(r.role))
    );
    const canManage =
      session.user.isSuperAdmin || userPermissions.has("events:manage");

    const userDeptIds = session.user.churchRoles
      .filter((r) => r.churchId === existing.churchId)
      .flatMap((r) => r.departments.map((d) => d.department.id));
    const isAssignedDeptMember =
      existing.assignedDeptId !== null &&
      userDeptIds.includes(existing.assignedDeptId);

    const isOwner = existing.submittedById === session.user.id;

    if (!canManage && !isAssignedDeptMember && !isOwner) {
      throw new ApiError(403, "Accès refusé");
    }

    const body = await request.json();
    const data = patchSchema.parse(body);

    const isPending = existing.status === "EN_ATTENTE";

    if (isOwner && !canManage && !isAssignedDeptMember) {
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

    if (data.status !== undefined && data.status !== "ANNULE" && !canManage && !isAssignedDeptMember) {
      throw new ApiError(403, "Seuls les membres du département assigné peuvent modifier le statut");
    }

    // Refusal requires a note
    if (data.status === "REFUSEE" && !data.reviewNotes) {
      throw new ApiError(400, "Une note est obligatoire pour refuser une demande");
    }

    // Merge payload fields updates
    const currentPayload = (existing.payload as Record<string, unknown>) ?? {};
    const payloadUpdates: Record<string, unknown> = {};
    if (data.deliveryLink !== undefined) payloadUpdates.deliveryLink = data.deliveryLink;
    if (data.format !== undefined) payloadUpdates.format = data.format;
    if (data.brief !== undefined) payloadUpdates.brief = data.brief;
    if (data.deadline !== undefined) payloadUpdates.deadline = data.deadline;
    // Owner payload update (full payload object merge)
    if (data.payload !== undefined) Object.assign(payloadUpdates, data.payload);
    const hasPayloadUpdates = Object.keys(payloadUpdates).length > 0;
    const mergedPayload = hasPayloadUpdates
      ? { ...currentPayload, ...payloadUpdates }
      : undefined;

    const isExecutableType = EXECUTABLE_TYPES.includes(existing.type);

    const updated = await prisma.$transaction(async (tx) => {
      // For executable types approved → run auto-execution
      if (data.status === "APPROUVEE" && isExecutableType) {
        // Execute using the effective payload (merged updates take precedence over stored payload)
        const effectivePayload = mergedPayload ?? currentPayload;
        const execResult = await executeRequest(
          tx,
          id,
          existing.churchId,
          existing.type,
          effectivePayload,
          session.user.id
        );

        const result = await tx.request.update({
          where: { id },
          data: {
            status: execResult.success ? "EXECUTEE" : "ERREUR",
            reviewedBy: { connect: { id: session.user.id } },
            reviewedAt: new Date(),
            ...(data.reviewNotes !== undefined && { reviewNotes: data.reviewNotes }),
            ...(execResult.success && { executedAt: new Date() }),
            ...(!execResult.success && { executionError: execResult.error }),
          },
          select: { id: true, type: true, status: true, executionError: true },
        });

        return result;
      }

      const result = await tx.request.update({
        where: { id },
        data: {
          ...(data.status && { status: data.status }),
          ...(data.title !== undefined && { title: data.title }),
          ...(data.reviewNotes !== undefined && { reviewNotes: data.reviewNotes }),
          ...(mergedPayload && { payload: mergedPayload as Prisma.InputJsonValue }),
          ...(data.status !== undefined && {
            reviewedBy: { connect: { id: session.user.id } },
            reviewedAt: new Date(),
          }),
        },
        select: { id: true, type: true, status: true },
      });

      // Cascade cancellation: when parent request is cancelled, cancel children
      if (
        data.status === "ANNULE" &&
        (result.type === "DIFFUSION_INTERNE" || result.type === "RESEAUX_SOCIAUX")
      ) {
        await tx.request.updateMany({
          where: { parentRequestId: id },
          data: { status: "ANNULE" },
        });
      }

      // Sync announcement status when a parent request changes status
      if (
        data.status !== undefined &&
        existing.announcementId &&
        (result.type === "DIFFUSION_INTERNE" || result.type === "RESEAUX_SOCIAUX")
      ) {
        const siblingStatuses = await tx.request.findMany({
          where: {
            announcementId: existing.announcementId,
            parentRequestId: null,
            id: { not: id },
          },
          select: { status: true },
        });

        const allStatuses = [data.status, ...siblingStatuses.map((s) => s.status)];

        let announcementStatus: "EN_ATTENTE" | "EN_COURS" | "TRAITEE" | "ANNULEE";
        if (allStatuses.every((s) => s === "ANNULE")) {
          announcementStatus = "ANNULEE";
        } else if (allStatuses.every((s) => s === "LIVRE" || s === "ANNULE")) {
          announcementStatus = "TRAITEE";
        } else if (allStatuses.some((s) => s === "EN_COURS" || s === "LIVRE")) {
          announcementStatus = "EN_COURS";
        } else {
          announcementStatus = "EN_ATTENTE";
        }

        await tx.announcement.update({
          where: { id: existing.announcementId },
          data: { status: announcementStatus },
        });
      }

      return result;
    });

    await logAudit({ userId: session.user.id, churchId: existing.churchId, action: "UPDATE", entityType: "Request", entityId: id, details: { status: data.status, type: existing.type } });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
