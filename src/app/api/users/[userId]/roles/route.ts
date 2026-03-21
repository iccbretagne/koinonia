import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { z } from "zod";

const deptEntrySchema = z.object({
  id: z.string(),
  isDeputy: z.boolean().optional().default(false),
});

const roleSchema = z.object({
  churchId: z.string().min(1),
  role: z.enum([
    "SUPER_ADMIN",
    "ADMIN",
    "SECRETARY",
    "MINISTER",
    "DEPARTMENT_HEAD",
    "DISCIPLE_MAKER",
    "REPORTER",
  ]),
  ministryId: z.string().optional(),
  departments: z.array(deptEntrySchema).optional(),
  departmentIds: z.array(z.string()).optional(), // legacy
});

const patchSchema = z.object({
  roleId: z.string().min(1),
  ministryId: z.string().nullable().optional(),
  departments: z.array(deptEntrySchema).optional(),
  departmentIds: z.array(z.string()).optional(), // legacy
});

function normalizeDepts(
  departments?: { id: string; isDeputy?: boolean }[],
  departmentIds?: string[]
): { id: string; isDeputy: boolean }[] | undefined {
  if (departments) return departments.map((d) => ({ id: d.id, isDeputy: d.isDeputy ?? false }));
  if (departmentIds) return departmentIds.map((id) => ({ id, isDeputy: false }));
  return undefined;
}

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
    const { churchId, role, ministryId, departments, departmentIds } =
      roleSchema.parse(body);
    const depts = normalizeDepts(departments, departmentIds);

    const userRole = await prisma.userChurchRole.create({
      data: {
        userId,
        churchId,
        role,
        ...(role === "MINISTER" && ministryId ? { ministryId } : {}),
        ...(role === "DEPARTMENT_HEAD" && depts?.length
          ? {
              departments: {
                create: depts.map((d) => ({
                  departmentId: d.id,
                  isDeputy: d.isDeputy,
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
    const { roleId, ministryId, departments, departmentIds } = patchSchema.parse(body);
    const depts = normalizeDepts(departments, departmentIds);

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
      if (depts !== undefined) {
        await tx.userDepartment.deleteMany({
          where: { userChurchRoleId: roleId },
        });

        if (depts.length > 0) {
          await tx.userDepartment.createMany({
            data: depts.map((d) => ({
              userChurchRoleId: roleId,
              departmentId: d.id,
              isDeputy: d.isDeputy,
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
