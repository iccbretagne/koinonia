import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { z } from "zod";

const roleSchema = z.object({
  churchId: z.string().min(1),
  role: z.enum([
    "SUPER_ADMIN",
    "ADMIN",
    "SECRETARY",
    "MINISTER",
    "DEPARTMENT_HEAD",
    "DISCIPLE_MAKER",
  ]),
  ministryId: z.string().optional(),
  departmentIds: z.array(z.string()).optional(),
});

const patchSchema = z.object({
  roleId: z.string().min(1),
  ministryId: z.string().nullable().optional(),
  departmentIds: z.array(z.string()).optional(),
});

const roleInclude = {
  church: { select: { id: true, name: true } },
  ministry: { select: { id: true, name: true } },
  departments: {
    include: { department: { select: { id: true, name: true } } },
  },
} as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await requirePermission("users:manage");
    const { userId } = await params;
    const body = await request.json();
    const { churchId, role, ministryId, departmentIds } =
      roleSchema.parse(body);

    const userRole = await prisma.userChurchRole.create({
      data: {
        userId,
        churchId,
        role,
        ...(role === "MINISTER" && ministryId
          ? { ministryId }
          : {}),
        ...(role === "DEPARTMENT_HEAD" && departmentIds?.length
          ? {
              departments: {
                create: departmentIds.map((departmentId) => ({
                  departmentId,
                })),
              },
            }
          : {}),
      },
      include: roleInclude,
    });

    return successResponse(userRole, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await requirePermission("users:manage");
    const { userId } = await params;
    const body = await request.json();
    const { roleId, ministryId, departmentIds } = patchSchema.parse(body);

    // Verify the role belongs to this user
    const existing = await prisma.userChurchRole.findFirst({
      where: { id: roleId, userId },
    });

    if (!existing) {
      return Response.json({ error: "Rôle introuvable" }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Update ministryId
      if (ministryId !== undefined) {
        await tx.userChurchRole.update({
          where: { id: roleId },
          data: { ministryId },
        });
      }

      // Replace departments
      if (departmentIds !== undefined) {
        await tx.userDepartment.deleteMany({
          where: { userChurchRoleId: roleId },
        });

        if (departmentIds.length > 0) {
          await tx.userDepartment.createMany({
            data: departmentIds.map((departmentId) => ({
              userChurchRoleId: roleId,
              departmentId,
            })),
          });
        }
      }

      return tx.userChurchRole.findUnique({
        where: { id: roleId },
        include: roleInclude,
      });
    });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await requirePermission("users:manage");
    const { userId } = await params;
    const body = await request.json();
    const { churchId, role } = roleSchema.parse(body);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.userChurchRole.findUnique({
        where: { userId_churchId_role: { userId, churchId, role } },
      });

      if (!existing) {
        throw new Error("Rôle introuvable");
      }

      // Delete associated UserDepartment records first (FK constraint)
      await tx.userDepartment.deleteMany({
        where: { userChurchRoleId: existing.id },
      });

      await tx.userChurchRole.delete({
        where: { id: existing.id },
      });
    });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
