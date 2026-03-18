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

    const isStatusChange = data.status !== undefined;
    const isDelivery = data.status === "LIVRE";

    if (isDelivery && !data.deliveryLink && !isAssignedDeptMember && !canManage) {
      throw new ApiError(400, "Un lien de livraison est requis pour marquer comme livré");
    }

    const updated = await prisma.serviceRequest.update({
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
        ...(isStatusChange && {
          reviewedById: session.user.id,
          reviewedAt: new Date(),
        }),
      },
    });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
