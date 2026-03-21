import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { DepartmentFunction } from "@prisma/client";
import { z } from "zod";

const createSchema = z.object({
  churchId: z.string().min(1, "L'église est requise"),
  title: z.string().min(1, "Le titre est requis"),
  brief: z.string().nullable().optional(),
  format: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  ministryId: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    const type = searchParams.get("type");
    const assignedDeptId = searchParams.get("assignedDeptId");

    if (!churchId) throw new ApiError(400, "churchId requis");
    const session = await requireChurchPermission("planning:view", churchId);

    const userPermissions = new Set(
      session.user.churchRoles.flatMap((r) => hasPermission(r.role))
    );
    const canManage =
      session.user.isSuperAdmin || userPermissions.has("events:manage");

    const serviceRequests = await prisma.serviceRequest.findMany({
      where: {
        churchId,
        parentRequestId: null,
        ...(type ? { type: type as never } : {}),
        ...(assignedDeptId ? { assignedDeptId } : {}),
        ...(canManage ? {} : { submittedById: session.user.id }),
      },
      include: {
        submittedBy: { select: { id: true, name: true, displayName: true } },
        department: { select: { id: true, name: true } },
        ministry: { select: { id: true, name: true } },
        assignedDept: { select: { id: true, name: true } },
        announcement: {
          select: {
            id: true,
            title: true,
            eventDate: true,
            isSaveTheDate: true,
          },
        },
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
      orderBy: { submittedAt: "desc" },
    });

    return successResponse(serviceRequests);
  } catch (error) {
    return errorResponse(error);
  }
}

// Standalone visual request (no announcement)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = createSchema.parse(body);
    const session = await requireChurchPermission("planning:view", data.churchId);
    requireRateLimit(request, { prefix: `mut:${session.user.id}`, ...RATE_LIMIT_MUTATION });

    const productionDept = await prisma.department.findFirst({
      where: {
        function: DepartmentFunction.PRODUCTION_MEDIA,
        ministry: { churchId: data.churchId },
      },
      select: { id: true },
    });

    const serviceRequest = await prisma.serviceRequest.create({
      data: {
        churchId: data.churchId,
        type: "VISUEL",
        submittedById: session.user.id,
        departmentId: data.departmentId ?? null,
        ministryId: data.ministryId ?? null,
        assignedDeptId: productionDept?.id ?? null,
        title: data.title,
        brief: data.brief ?? null,
        format: data.format ?? null,
        deadline: data.deadline ? new Date(data.deadline) : null,
      },
    });

    await logAudit({ userId: session.user.id, churchId: data.churchId, action: "CREATE", entityType: "ServiceRequest", entityId: serviceRequest.id, details: { title: data.title, type: "VISUEL" } });

    return successResponse(serviceRequest, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
