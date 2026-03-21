import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

// { id, isDeputy? } — format enrichi pour gérer principal vs adjoint
const deptAssignmentSchema = z.object({
  id: z.string().min(1),
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
  ]),
  ministryId: z.string().optional(),
  // Supporte les deux formats : string[] (legacy) ou { id, isDeputy }[]
  departmentIds: z.array(z.string()).optional(),
  departments: z.array(deptAssignmentSchema).optional(),
});

const patchSchema = z.object({
  roleId: z.string().min(1),
  ministryId: z.string().nullable().optional(),
  departmentIds: z.array(z.string()).optional(),
  departments: z.array(deptAssignmentSchema).optional(),
});

const roleInclude = {
  church: { select: { id: true, name: true } },
  ministry: { select: { id: true, name: true } },
  departments: {
    include: { department: { select: { id: true, name: true } } },
  },
} as const;

const PRIVILEGED_ROLES = ["SUPER_ADMIN", "ADMIN", "SECRETARY"] as const;

// Normalise les deux formats d'entrée vers { id, isDeputy }[]
function normalizeDepts(
  departments?: { id: string; isDeputy?: boolean }[],
  departmentIds?: string[]
): { id: string; isDeputy: boolean }[] | undefined {
  if (departments?.length) return departments.map((d) => ({ id: d.id, isDeputy: d.isDeputy ?? false }));
  if (departmentIds?.length) return departmentIds.map((id) => ({ id, isDeputy: false }));
  return undefined;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await requireAnyPermission("users:manage", "departments:manage");
    const { userId } = await params;
    const body = await request.json();
    const { churchId, role, ministryId, departmentIds, departments } = roleSchema.parse(body);

    // Les ADMIN ne peuvent assigner que MINISTER et DEPARTMENT_HEAD
    if (!session.user.isSuperAdmin && PRIVILEGED_ROLES.includes(role as typeof PRIVILEGED_ROLES[number])) {
      const hasUsersManage = session.user.churchRoles.some((r) => r.role === "SUPER_ADMIN");
      if (!hasUsersManage) throw new ApiError(403, "Droits insuffisants pour attribuer ce rôle");
    }

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
                create: depts.map(({ id: departmentId, isDeputy }) => ({ departmentId, isDeputy })),
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
    await requireAnyPermission("users:manage", "departments:manage");
    const { userId } = await params;
    const body = await request.json();
    const { roleId, ministryId, departmentIds, departments } = patchSchema.parse(body);

    const existing = await prisma.userChurchRole.findFirst({
      where: { id: roleId, userId },
    });

    if (!existing) {
      return Response.json({ error: "Rôle introuvable" }, { status: 404 });
    }

    const depts = normalizeDepts(departments, departmentIds);

    const updated = await prisma.$transaction(async (tx) => {
      if (ministryId !== undefined) {
        await tx.userChurchRole.update({
          where: { id: roleId },
          data: { ministryId },
        });
      }

      if (depts !== undefined) {
        await tx.userDepartment.deleteMany({ where: { userChurchRoleId: roleId } });

        if (depts.length > 0) {
          await tx.userDepartment.createMany({
            data: depts.map(({ id: departmentId, isDeputy }) => ({
              userChurchRoleId: roleId,
              departmentId,
              isDeputy,
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
    await requireAnyPermission("users:manage", "departments:manage");
    const { userId } = await params;
    const body = await request.json();
    const { churchId, role } = roleSchema.parse(body);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.userChurchRole.findUnique({
        where: { userId_churchId_role: { userId, churchId, role } },
      });

      if (!existing) throw new Error("Rôle introuvable");

      await tx.userDepartment.deleteMany({ where: { userChurchRoleId: existing.id } });
      await tx.userChurchRole.delete({ where: { id: existing.id } });
    });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
