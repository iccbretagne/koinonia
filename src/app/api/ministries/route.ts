import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");

    if (!churchId) throw new ApiError(400, "churchId requis");
    await requireChurchPermission("departments:view", churchId);

    const ministries = await prisma.ministry.findMany({
      where: { churchId },
      include: { church: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    });

    return successResponse(ministries);
  } catch (error) {
    return errorResponse(error);
  }
}

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1, "Au moins un ID requis"),
  action: z.enum(["delete", "update"]),
  data: z.object({
    name: z.string().min(1).optional(),
    churchId: z.string().min(1).optional(),
  }).optional(),
});

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { ids, action, data } = bulkSchema.parse(body);

    if (ids.length === 0) throw new ApiError(400, "Au moins un ID requis");
    const { resolveChurchId } = await import("@/lib/auth");
    const minChurchId = await resolveChurchId("ministry", ids[0]);
    await requireChurchPermission("departments:manage", minChurchId);

    if (action === "delete") {
      await prisma.$transaction(async (tx) => {
        const deptIds = (
          await tx.department.findMany({
            where: { ministryId: { in: ids } },
            select: { id: true },
          })
        ).map((d) => d.id);
        if (deptIds.length > 0) {
          const eventDeptIds = (
            await tx.eventDepartment.findMany({
              where: { departmentId: { in: deptIds } },
              select: { id: true },
            })
          ).map((ed) => ed.id);
          await tx.planning.deleteMany({ where: { eventDepartmentId: { in: eventDeptIds } } });
          await tx.planning.deleteMany({ where: { member: { departmentId: { in: deptIds } } } });
          await tx.eventDepartment.deleteMany({ where: { departmentId: { in: deptIds } } });
          await tx.member.deleteMany({ where: { departmentId: { in: deptIds } } });
          await tx.userDepartment.deleteMany({ where: { departmentId: { in: deptIds } } });
        }
        await tx.department.deleteMany({ where: { ministryId: { in: ids } } });
        await tx.userChurchRole.updateMany({ where: { ministryId: { in: ids } }, data: { ministryId: null } });
        await tx.ministry.deleteMany({ where: { id: { in: ids } } });
      });
      return successResponse({ deleted: ids.length });
    }

    if (!data || Object.keys(data).length === 0) {
      return errorResponse(new Error("Aucune donnée à mettre à jour"));
    }

    await prisma.ministry.updateMany({
      where: { id: { in: ids } },
      data,
    });

    return successResponse({ updated: ids.length });
  } catch (error) {
    return errorResponse(error);
  }
}

const createSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  churchId: z.string().min(1, "L'église est requise"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = createSchema.parse(body);
    const session = await requireChurchPermission("departments:manage", data.churchId);
    requireRateLimit(request, { prefix: `mut:${session.user.id}`, ...RATE_LIMIT_MUTATION });

    const ministry = await prisma.ministry.create({
      data,
      include: { church: { select: { id: true, name: true } } },
    });

    return successResponse(ministry, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
