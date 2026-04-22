import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { rolePermissions } from "@/lib/registry";
import { DEPT_FN } from "@/lib/department-functions";
import { z } from "zod";

const DEMAND_TYPES = [
  "AJOUT_EVENEMENT",
  "MODIFICATION_EVENEMENT",
  "ANNULATION_EVENEMENT",
  "MODIFICATION_PLANNING",
  "DEMANDE_ACCES",
] as const;

const createVisuelSchema = z.object({
  churchId: z.string().min(1, "L'église est requise"),
  type: z.literal("VISUEL"),
  title: z.string().min(1, "Le titre est requis"),
  brief: z.string().nullable().optional(),
  format: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  ministryId: z.string().nullable().optional(),
});

const createDemandSchema = z.object({
  churchId: z.string().min(1, "L'église est requise"),
  type: z.enum(DEMAND_TYPES),
  title: z.string().min(1, "Le titre est requis"),
  payload: z.record(z.unknown()),
  departmentId: z.string().nullable().optional(),
  ministryId: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    const type = searchParams.get("type");
    const assignedDeptId = searchParams.get("assignedDeptId");
    const submittedByMe = searchParams.get("submittedByMe");

    if (!churchId) throw new ApiError(400, "churchId requis");
    const session = await requireChurchPermission("planning:view", churchId);

    const churchPermissions = new Set(
      session.user.churchRoles
        .filter((r) => r.churchId === churchId)
        .flatMap((r) => rolePermissions[r.role] ?? [])
    );
    const canManage =
      session.user.isSuperAdmin || churchPermissions.has("events:manage");

    const requests = await prisma.request.findMany({
      where: {
        churchId,
        parentRequestId: null,
        ...(type ? { type: type as never } : {}),
        ...(assignedDeptId ? { assignedDeptId } : {}),
        ...(submittedByMe === "true"
          ? { submittedById: session.user.id }
          : canManage
            ? {}
            : { submittedById: session.user.id }),
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
            payload: true,
            assignedDept: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { submittedAt: "desc" },
    });

    return successResponse(requests);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const type = body.type;

    // Route to appropriate handler based on type
    if (type === "VISUEL") {
      return await createVisuel(request, body);
    }
    if (DEMAND_TYPES.includes(type)) {
      return await createDemand(request, body);
    }

    throw new ApiError(400, `Type de demande invalide : ${type}`);
  } catch (error) {
    return errorResponse(error);
  }
}

async function createVisuel(_request: Request, body: unknown) {
  const data = createVisuelSchema.parse(body);
  const session = await requireChurchPermission("planning:view", data.churchId);

  // Validate cross-tenant references
  if (data.departmentId) {
    const dept = await prisma.department.findUnique({
      where: { id: data.departmentId },
      select: { ministry: { select: { churchId: true } } },
    });
    if (!dept || dept.ministry.churchId !== data.churchId) {
      throw new ApiError(400, "Le département n'appartient pas à cette église");
    }
  }
  if (data.ministryId) {
    const ministry = await prisma.ministry.findUnique({
      where: { id: data.ministryId },
      select: { churchId: true },
    });
    if (!ministry || ministry.churchId !== data.churchId) {
      throw new ApiError(400, "Le ministère n'appartient pas à cette église");
    }
  }

  const productionDept = await prisma.department.findFirst({
    where: {
      function: DEPT_FN.PRODUCTION_MEDIA,
      ministry: { churchId: data.churchId },
    },
    select: { id: true },
  });

  const created = await prisma.request.create({
    data: {
      churchId: data.churchId,
      type: "VISUEL",
      submittedById: session.user.id,
      departmentId: data.departmentId ?? null,
      ministryId: data.ministryId ?? null,
      assignedDeptId: productionDept?.id ?? null,
      title: data.title,
      payload: {
        brief: data.brief ?? null,
        format: data.format ?? null,
        deadline: data.deadline ?? null,
      },
    },
  });

  await logAudit({ userId: session.user.id, churchId: data.churchId, action: "CREATE", entityType: "Request", entityId: created.id, details: { title: data.title, type: "VISUEL" } });

  return successResponse(created, 201);
}

async function createDemand(_request: Request, body: unknown) {
  const data = createDemandSchema.parse(body);
  const session = await requireChurchPermission("planning:edit", data.churchId);

  // Validate cross-tenant references
  if (data.departmentId) {
    const dept = await prisma.department.findUnique({
      where: { id: data.departmentId },
      select: { ministry: { select: { churchId: true } } },
    });
    if (!dept || dept.ministry.churchId !== data.churchId) {
      throw new ApiError(400, "Le département n'appartient pas à cette église");
    }
  }
  if (data.ministryId) {
    const ministry = await prisma.ministry.findUnique({
      where: { id: data.ministryId },
      select: { churchId: true },
    });
    if (!ministry || ministry.churchId !== data.churchId) {
      throw new ApiError(400, "Le ministère n'appartient pas à cette église");
    }
  }

  // Demands are assigned to the secretariat department
  const secretariatDept = await prisma.department.findFirst({
    where: {
      function: DEPT_FN.SECRETARIAT,
      ministry: { churchId: data.churchId },
    },
    select: { id: true },
  });

  const created = await prisma.request.create({
    data: {
      churchId: data.churchId,
      type: data.type,
      submittedById: session.user.id,
      departmentId: data.departmentId ?? null,
      ministryId: data.ministryId ?? null,
      assignedDeptId: secretariatDept?.id ?? null,
      title: data.title,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: data.payload as any,
    },
  });

  await logAudit({ userId: session.user.id, churchId: data.churchId, action: "CREATE", entityType: "Request", entityId: created.id, details: { title: data.title, type: data.type } });

  return successResponse(created, 201);
}
