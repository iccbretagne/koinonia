import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { hasPermission } from "@/lib/permissions";
import { z } from "zod";

const patchSchema = z.object({
  status: z
    .enum(["EN_ATTENTE", "EN_COURS", "TRAITEE", "ANNULEE"])
    .optional(),
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  isUrgent: z.boolean().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("planning:view");
    const { id } = await params;

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
        serviceRequests: {
          where: { parentRequestId: null },
          include: {
            assignedDept: { select: { id: true, name: true } },
            reviewedBy: { select: { id: true, name: true, displayName: true } },
            childRequests: {
              select: {
                id: true,
                type: true,
                status: true,
                format: true,
                deliveryLink: true,
                assignedDept: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!announcement) throw new ApiError(404, "Annonce introuvable");

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
    const session = await requirePermission("planning:view");
    const { id } = await params;

    const announcement = await prisma.announcement.findUnique({
      where: { id },
      select: { id: true, submittedById: true, churchId: true },
    });
    if (!announcement) throw new ApiError(404, "Annonce introuvable");

    const userPermissions = new Set(
      session.user.churchRoles.flatMap((r) => hasPermission(r.role))
    );
    const canManage =
      session.user.isSuperAdmin || userPermissions.has("events:manage");
    const isOwner = announcement.submittedById === session.user.id;

    if (!canManage && !isOwner) throw new ApiError(403, "Accès refusé");

    const body = await request.json();
    const data = patchSchema.parse(body);

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
        },
      });

      // Cascade cancellation: annuler toutes les ServiceRequest liees
      if (data.status === "ANNULEE") {
        await tx.serviceRequest.updateMany({
          where: { announcementId: id },
          data: { status: "ANNULE" },
        });
      }

      return result;
    });

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
    const session = await requirePermission("planning:view");
    const { id } = await params;

    const announcement = await prisma.announcement.findUnique({
      where: { id },
      select: { id: true, submittedById: true },
    });
    if (!announcement) throw new ApiError(404, "Annonce introuvable");

    const userPermissions = new Set(
      session.user.churchRoles.flatMap((r) => hasPermission(r.role))
    );
    const canManage =
      session.user.isSuperAdmin || userPermissions.has("events:manage");
    const isOwner = announcement.submittedById === session.user.id;

    if (!canManage && !isOwner) throw new ApiError(403, "Accès refusé");

    await prisma.announcement.delete({ where: { id } });

    return successResponse({ deleted: id });
  } catch (error) {
    return errorResponse(error);
  }
}
