import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { rolePermissions } from "@/lib/registry";
import { z } from "zod";

const patchSchema = z.object({
  status: z
    .enum(["EN_ATTENTE", "EN_COURS", "TRAITEE", "ANNULEE"])
    .optional(),
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  isUrgent: z.boolean().optional(),
  isSaveTheDate: z.boolean().optional(),
  eventDate: z.string().nullable().optional(),
  channelInterne: z.boolean().optional(),
  channelExterne: z.boolean().optional(),
  targetEventIds: z.array(z.string()).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Resolve churchId + ownership without a full join
    const minimal = await prisma.announcement.findUnique({
      where: { id },
      select: { churchId: true, submittedById: true },
    });
    if (!minimal) throw new ApiError(404, "Annonce introuvable");

    const session = await requireChurchPermission("planning:view", minimal.churchId);

    const userPermissions = new Set(
      session.user.churchRoles
        .filter((r) => r.churchId === minimal.churchId)
        .flatMap((r) => rolePermissions[r.role] ?? [])
    );
    const canManage = session.user.isSuperAdmin || userPermissions.has("events:manage");
    const isOwner = minimal.submittedById === session.user.id;

    if (!canManage && !isOwner) throw new ApiError(403, "Accès refusé");

    const announcement = await prisma.announcement.findUnique({
      where: { id },
      include: {
        submittedBy: { select: { id: true, name: true, displayName: true } },
        department: { select: { id: true, name: true } },
        ministry: { select: { id: true, name: true } },
        targetEvents: {
          include: {
            event: { select: { id: true, title: true, date: true } },
          },
        },
        requests: {
          where: { parentRequestId: null },
          include: {
            assignedDept: { select: { id: true, name: true } },
            reviewedBy: { select: { id: true, name: true, displayName: true } },
            childRequests: {
              select: {
                id: true,
                type: true,
                status: true,
                payload: true,
                assignedDept: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    return successResponse(announcement);
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

    const announcement = await prisma.announcement.findUnique({
      where: { id },
      select: { id: true, submittedById: true, churchId: true },
    });
    if (!announcement) throw new ApiError(404, "Annonce introuvable");

    const session = await requireChurchPermission("planning:view", announcement.churchId);

    const userPermissions = new Set(
      session.user.churchRoles
        .filter((r) => r.churchId === announcement.churchId)
        .flatMap((r) => rolePermissions[r.role] ?? [])
    );
    const canManage =
      session.user.isSuperAdmin || userPermissions.has("events:manage");
    const isOwner = announcement.submittedById === session.user.id;

    if (!canManage && !isOwner) throw new ApiError(403, "Accès refusé");

    const body = await request.json();
    const data = patchSchema.parse(body);

    // Validate targetEventIds belong to churchId
    if (data.targetEventIds !== undefined && data.targetEventIds.length > 0) {
      const validEvents = await prisma.event.count({
        where: { id: { in: data.targetEventIds }, churchId: announcement.churchId },
      });
      if (validEvents !== data.targetEventIds.length) {
        throw new ApiError(400, "Événements cibles invalides ou hors périmètre");
      }
    }

    // Status changes: managers can set any status, owners can only cancel
    if (data.status !== undefined) {
      if (!canManage && !isOwner) {
        throw new ApiError(403, "Modification du statut réservée aux gestionnaires");
      }
      if (!canManage && isOwner && data.status !== "ANNULEE") {
        throw new ApiError(403, "Vous pouvez uniquement annuler votre propre annonce");
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.announcement.update({
        where: { id },
        data: {
          ...(data.status && { status: data.status }),
          ...(data.title && { title: data.title }),
          ...(data.content && { content: data.content }),
          ...(data.isUrgent !== undefined && { isUrgent: data.isUrgent }),
          ...(data.isSaveTheDate !== undefined && { isSaveTheDate: data.isSaveTheDate }),
          ...(data.eventDate !== undefined && { eventDate: data.eventDate ? new Date(data.eventDate) : null }),
          ...(data.channelInterne !== undefined && { channelInterne: data.channelInterne }),
          ...(data.channelExterne !== undefined && { channelExterne: data.channelExterne }),
          ...(data.targetEventIds !== undefined && {
            targetEvents: {
              deleteMany: {},
              create: data.targetEventIds.map((eventId) => ({ eventId })),
            },
          }),
        },
      });

      // Cascade cancellation: annuler toutes les Request liées
      if (data.status === "ANNULEE") {
        await tx.request.updateMany({
          where: { announcementId: id },
          data: { status: "ANNULE" },
        });
      }

      return result;
    });

    await logAudit({ userId: session.user.id, churchId: announcement.churchId, action: "UPDATE", entityType: "Announcement", entityId: id, details: data });

    return successResponse(updated);
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

    const announcement = await prisma.announcement.findUnique({
      where: { id },
      select: { id: true, submittedById: true, churchId: true },
    });
    if (!announcement) throw new ApiError(404, "Annonce introuvable");

    const session = await requireChurchPermission("planning:view", announcement.churchId);

    const userPermissions = new Set(
      session.user.churchRoles
        .filter((r) => r.churchId === announcement.churchId)
        .flatMap((r) => rolePermissions[r.role] ?? [])
    );
    const canManage =
      session.user.isSuperAdmin || userPermissions.has("events:manage");
    const isOwner = announcement.submittedById === session.user.id;

    if (!canManage && !isOwner) throw new ApiError(403, "Accès refusé");

    await prisma.announcement.delete({ where: { id } });

    await logAudit({ userId: session.user.id, churchId: announcement.churchId, action: "DELETE", entityType: "Announcement", entityId: id });

    return successResponse({ deleted: id });
  } catch (error) {
    return errorResponse(error);
  }
}
