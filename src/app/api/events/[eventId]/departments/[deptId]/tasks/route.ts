import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string; deptId: string }> }
) {
  try {
    await requirePermission("planning:view");
    const { eventId, deptId: departmentId } = await params;

    const eventDept = await prisma.eventDepartment.findUnique({
      where: { eventId_departmentId: { eventId, departmentId } },
    });

    if (!eventDept) {
      throw new ApiError(404, "Event-department link not found");
    }

    const tasks = await prisma.task.findMany({
      where: { eventDepartmentId: eventDept.id },
      include: {
        assignments: {
          include: {
            member: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return successResponse(tasks);
  } catch (error) {
    return errorResponse(error);
  }
}

const createSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  description: z.string().optional(),
  memberIds: z.array(z.string()).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string; deptId: string }> }
) {
  try {
    await requirePermission("planning:edit");
    const { eventId, deptId: departmentId } = await params;
    const body = await request.json();
    const { name, description, memberIds } = createSchema.parse(body);

    // Find or create event-department link
    let eventDept = await prisma.eventDepartment.findUnique({
      where: { eventId_departmentId: { eventId, departmentId } },
    });

    if (!eventDept) {
      eventDept = await prisma.eventDepartment.create({
        data: { eventId, departmentId },
      });
    }

    const task = await prisma.task.create({
      data: {
        eventDepartmentId: eventDept.id,
        name,
        description: description || null,
        assignments: memberIds?.length
          ? {
              create: memberIds.map((memberId) => ({ memberId })),
            }
          : undefined,
      },
      include: {
        assignments: {
          include: {
            member: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    return successResponse(task, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ eventId: string; deptId: string }> }
) {
  try {
    await requirePermission("planning:edit");
    await params;
    const body = await request.json();
    const { taskId } = z.object({ taskId: z.string() }).parse(body);

    await prisma.taskAssignment.deleteMany({ where: { taskId } });
    await prisma.task.delete({ where: { id: taskId } });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
