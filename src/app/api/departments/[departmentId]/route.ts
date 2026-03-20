import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";
import type { Session } from "next-auth";

function getMinisterMinistryIds(session: Session): string[] | null {
  const isGlobal = session.user.churchRoles.some((r) =>
    ["SUPER_ADMIN", "ADMIN"].includes(r.role)
  );
  if (isGlobal) return null;
  return session.user.churchRoles
    .filter((r) => r.role === "MINISTER" && r.ministryId)
    .map((r) => r.ministryId as string);
}

async function checkDepartmentScope(session: Session, departmentId: string) {
  const allowedMinistries = getMinisterMinistryIds(session);
  if (allowedMinistries === null) return;
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { ministryId: true },
  });
  if (!dept || !allowedMinistries.includes(dept.ministryId)) {
    throw new ApiError(403, "Vous ne pouvez modifier que les départements de votre ministère");
  }
}

const updateSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  ministryId: z.string().min(1, "Le ministère est requis"),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ departmentId: string }> }
) {
  try {
    const session = await requirePermission("departments:manage");
    const { departmentId } = await params;

    const deptCheck = await prisma.department.findUnique({ where: { id: departmentId }, select: { isSystem: true } });
    if (!deptCheck) throw new ApiError(404, "Département introuvable");
    if (deptCheck.isSystem && !session.user.isSuperAdmin) {
      throw new ApiError(403, "Ce département système ne peut pas être modifié");
    }

    await checkDepartmentScope(session, departmentId);
    const body = await request.json();
    const data = updateSchema.parse(body);

    const allowedMinistries = getMinisterMinistryIds(session);
    if (allowedMinistries !== null && !allowedMinistries.includes(data.ministryId)) {
      throw new ApiError(403, "Vous ne pouvez déplacer un département que vers votre ministère");
    }

    const department = await prisma.department.update({
      where: { id: departmentId },
      data,
      include: {
        ministry: { select: { id: true, name: true, churchId: true } },
      },
    });

    return successResponse(department);
  } catch (error) {
    return errorResponse(error);
  }
}

const patchFunctionSchema = z.object({
  function: z.enum(["SECRETARIAT", "COMMUNICATION", "PRODUCTION_MEDIA"]).nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ departmentId: string }> }
) {
  try {
    const session = await requirePermission("events:manage");
    const { departmentId } = await params;
    const body = await request.json();
    const data = patchFunctionSchema.parse(body);

    const dept = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, isSystem: true, ministry: { select: { churchId: true } } },
    });
    if (!dept) throw new ApiError(404, "Département introuvable");
    if (dept.isSystem && !session.user.isSuperAdmin) {
      throw new ApiError(403, "Ce département système ne peut pas être modifié");
    }

    // Clear existing dept with same function in the same church before assigning
    if (data.function !== null) {
      await prisma.department.updateMany({
        where: {
          function: data.function,
          ministry: { churchId: dept.ministry.churchId },
          NOT: { id: departmentId },
        },
        data: { function: null },
      });
    }

    const updated = await prisma.department.update({
      where: { id: departmentId },
      data: { function: data.function },
      select: { id: true, name: true, function: true },
    });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ departmentId: string }> }
) {
  try {
    const session = await requirePermission("departments:manage");
    const { departmentId } = await params;
    await checkDepartmentScope(session, departmentId);

    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      include: { members: true },
    });

    if (!department) {
      throw new ApiError(404, "Département introuvable");
    }

    if (department.isSystem && !session.user.isSuperAdmin) {
      throw new ApiError(403, "Ce département système ne peut pas être supprimé");
    }

    if (department.members.length > 0) {
      throw new ApiError(
        400,
        "Impossible de supprimer un département qui contient des STAR"
      );
    }

    await prisma.department.delete({ where: { id: departmentId } });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
