import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { hasPermission } from "@/lib/permissions";
import { z } from "zod";

const patchSchema = z.object({
  status: z.enum(["EN_ATTENTE", "EN_COURS", "LIVRE", "ANNULE"]).optional(),
  deliveryLink: z.string().nullable().optional(),
  reviewNotes: z.string().nullable().optional(),
  format: z.string().nullable().optional(),
  brief: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("planning:view");
    const { id } = await params;

    const serviceRequest = await prisma.serviceRequest.findUnique({
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
            channelInterne: true,
            channelExterne: true,
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

    if (!serviceRequest) throw new ApiError(404, "Demande introuvable");

    return successResponse(serviceRequest);
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

    const serviceRequest = await prisma.serviceRequest.findUnique({
      where: { id },
      select: {
        id: true,
        submittedById: true,
        assignedDeptId: true,
        churchId: true,
        type: true,
        announcementId: true,
      },
    });
    if (!serviceRequest) throw new ApiError(404, "Demande introuvable");

    const userPermissions = new Set(
      session.user.churchRoles.flatMap((r) => hasPermission(r.role))
    );
    const canManage =
      session.user.isSuperAdmin || userPermissions.has("events:manage");

    // Members of the assigned department can also update their own requests
    const userDeptIds = session.user.churchRoles.flatMap((r) =>
      r.departments.map((d) => d.department.id)
    );
    const isAssignedDeptMember =
      serviceRequest.assignedDeptId !== null &&
      userDeptIds.includes(serviceRequest.assignedDeptId);

    const isOwner = serviceRequest.submittedById === session.user.id;

    if (!canManage && !isAssignedDeptMember && !isOwner) {
      throw new ApiError(403, "Accès refusé");
    }

    const body = await request.json();
    const data = patchSchema.parse(body);

    // Owner can only read — status changes restricted to dept members and managers
    if (data.status !== undefined && !canManage && !isAssignedDeptMember) {
      throw new ApiError(403, "Seuls les membres du département assigné peuvent modifier le statut");
    }

    const isDelivery = data.status === "LIVRE";

    if (isDelivery && !data.deliveryLink && !isAssignedDeptMember && !canManage) {
      throw new ApiError(400, "Un lien de livraison est requis pour marquer comme livré");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.serviceRequest.update({
        where: { id },
        data: {
          ...(data.status && { status: data.status }),
          ...(data.deliveryLink !== undefined && {
            deliveryLink: data.deliveryLink,
          }),
          ...(data.reviewNotes !== undefined && {
            reviewNotes: data.reviewNotes,
          }),
          ...(data.format !== undefined && { format: data.format }),
          ...(data.brief !== undefined && { brief: data.brief }),
          ...(data.deadline !== undefined && {
            deadline: data.deadline ? new Date(data.deadline) : null,
          }),
          ...(data.status !== undefined && {
            reviewedById: session.user.id,
            reviewedAt: new Date(),
          }),
        },
        select: { id: true, type: true, status: true },
      });

      // Cascade cancellation: when a parent request is refused, cancel its VISUEL child
      if (
        data.status === "ANNULE" &&
        (result.type === "DIFFUSION_INTERNE" || result.type === "RESEAUX_SOCIAUX")
      ) {
        await tx.serviceRequest.updateMany({
          where: { parentRequestId: id },
          data: { status: "ANNULE" },
        });
      }

      // Sync announcement status when a parent SR (not VISUEL) changes status
      if (
        data.status !== undefined &&
        serviceRequest.announcementId &&
        (result.type === "DIFFUSION_INTERNE" || result.type === "RESEAUX_SOCIAUX")
      ) {
        const siblingStatuses = await tx.serviceRequest.findMany({
          where: {
            announcementId: serviceRequest.announcementId,
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
          where: { id: serviceRequest.announcementId },
          data: { status: announcementStatus },
        });
      }

      return result;
    });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
