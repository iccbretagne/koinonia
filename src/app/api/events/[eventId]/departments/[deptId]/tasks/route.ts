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
      throw new ApiError(404, "Ce département n'est pas lié à cet événement");
    }

    const tasks = await prisma.task.findMany({
      where: { departmentId },
      include: {
        assignments: {
          where: { eventId },
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

const assignSchema = z.object({
  taskId: z.string(),
  memberIds: z.array(z.string()),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ eventId: string; deptId: string }> }
) {
  try {
    await requirePermission("planning:edit");
    const { eventId, deptId: departmentId } = await params;
    const body = await request.json();
    const { taskId, memberIds } = assignSchema.parse(body);

    // Verify the task belongs to this department
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task || task.departmentId !== departmentId) {
      throw new ApiError(404, "Tâche introuvable dans ce département");
    }

    // Verify EventDepartment exists
    const eventDept = await prisma.eventDepartment.findUnique({
      where: { eventId_departmentId: { eventId, departmentId } },
    });

    if (!eventDept) {
      throw new ApiError(404, "Ce département n'est pas lié à cet événement");
    }

    // Verify each member is in service for this event
    if (memberIds.length > 0) {
      const plannings = await prisma.planning.findMany({
        where: {
          eventDepartmentId: eventDept.id,
          memberId: { in: memberIds },
          status: { in: ["EN_SERVICE", "EN_SERVICE_DEBRIEF"] },
        },
        select: { memberId: true },
      });

      const inServiceMemberIds = new Set(plannings.map((p) => p.memberId));
      const notInService = memberIds.filter((id) => !inServiceMemberIds.has(id));

      if (notInService.length > 0) {
        throw new ApiError(
          400,
          "Ce STAR n'est pas en service pour cet événement"
        );
      }
    }

    // Sync assignments: delete old, create new
    await prisma.$transaction([
      prisma.taskAssignment.deleteMany({
        where: { taskId, eventId },
      }),
      ...memberIds.map((memberId) =>
        prisma.taskAssignment.create({
          data: { taskId, memberId, eventId },
        })
      ),
    ]);

    // Return updated task with assignments for this event
    const updatedTask = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignments: {
          where: { eventId },
          include: {
            member: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    return successResponse(updatedTask);
  } catch (error) {
    return errorResponse(error);
  }
}
