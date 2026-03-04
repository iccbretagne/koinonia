import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ departmentId: string }> }
) {
  try {
    await requirePermission("planning:view");
    const { departmentId } = await params;

    const department = await prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department) {
      throw new ApiError(404, "Département introuvable");
    }

    const tasks = await prisma.task.findMany({
      where: { departmentId },
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
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ departmentId: string }> }
) {
  try {
    await requirePermission("planning:edit");
    const { departmentId } = await params;
    const body = await request.json();
    const { name, description } = createSchema.parse(body);

    const department = await prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department) {
      throw new ApiError(404, "Département introuvable");
    }

    const existing = await prisma.task.findUnique({
      where: { departmentId_name: { departmentId, name } },
    });

    if (existing) {
      throw new ApiError(409, "Une tâche avec ce nom existe déjà dans ce département");
    }

    const task = await prisma.task.create({
      data: {
        departmentId,
        name,
        description: description || null,
      },
    });

    return successResponse(task, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ departmentId: string }> }
) {
  try {
    await requirePermission("planning:edit");
    const { departmentId } = await params;
    const body = await request.json();
    const { taskId } = z.object({ taskId: z.string() }).parse(body);

    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task || task.departmentId !== departmentId) {
      throw new ApiError(404, "Tâche introuvable dans ce département");
    }

    await prisma.task.delete({ where: { id: taskId } });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
