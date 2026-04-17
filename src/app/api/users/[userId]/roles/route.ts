import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireRateLimit, RATE_LIMIT_SENSITIVE } from "@/lib/rate-limit";
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
    "REPORTER",
    "STAR",
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
    const { userId } = await params;
    const body = await request.json();
    const { churchId, role, ministryId, departmentIds, departments } = roleSchema.parse(body);

    // Vérifier permission dans l'église ciblée.
    // events:manage couvre SUPER_ADMIN, ADMIN, SECRETARY.
    // Décision v1.0 : SECRETARY peut gérer les rôles non-privilégiés (MINISTER, DEPARTMENT_HEAD,
    // DISCIPLE_MAKER, REPORTER, STAR) — rôle de confiance élevée, bras droit de l'admin.
    const session = await requireChurchPermission("events:manage", churchId);
    requireRateLimit(request, { prefix: `roles:${session.user.id}`, ...RATE_LIMIT_SENSITIVE });

    // Les rôles privilégiés nécessitent users:manage (seul SUPER_ADMIN)
    if (PRIVILEGED_ROLES.includes(role as typeof PRIVILEGED_ROLES[number])) {
      if (!session.user.isSuperAdmin) {
        throw new ApiError(403, "Droits insuffisants pour attribuer ce rôle");
      }
    }

    // Vérifier que le ministryId appartient à cette église
    if (ministryId) {
      const ministry = await prisma.ministry.findUnique({
        where: { id: ministryId },
        select: { churchId: true },
      });
      if (!ministry || ministry.churchId !== churchId) {
        throw new ApiError(400, "Ce ministère n'appartient pas à cette église");
      }
    }

    // Scope enforcement: MINISTER must have a ministry, DEPARTMENT_HEAD must have departments
    if (role === "MINISTER" && !ministryId) {
      throw new ApiError(400, "Le rôle Ministre requiert un ministère assigné");
    }

    const depts = normalizeDepts(departments, departmentIds);

    if (role === "DEPARTMENT_HEAD" && (!depts || depts.length === 0)) {
      throw new ApiError(400, "Le rôle Responsable de département requiert au moins un département assigné");
    }

    // Vérifier que les départements appartiennent à cette église
    if (depts?.length) {
      const deptRecords = await prisma.department.findMany({
        where: { id: { in: depts.map((d) => d.id) } },
        include: { ministry: { select: { churchId: true } } },
      });
      if (deptRecords.length !== depts.length) {
        throw new ApiError(400, "Un ou plusieurs départements sont introuvables");
      }
      for (const dept of deptRecords) {
        if (dept.ministry.churchId !== churchId) {
          throw new ApiError(400, `Le département "${dept.name}" n'appartient pas à cette église`);
        }
      }
    }

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

    await logAudit({ userId: session.user.id, churchId, action: "CREATE", entityType: "UserRole", entityId: userRole.id, details: { targetUserId: userId, role } });

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
    const { userId } = await params;
    const body = await request.json();
    const { roleId, ministryId, departmentIds, departments } = patchSchema.parse(body);

    // Trouver le rôle et vérifier qu'il appartient bien à cet utilisateur
    const existing = await prisma.userChurchRole.findFirst({
      where: { id: roleId, userId },
    });

    if (!existing) {
      return Response.json({ error: "Rôle introuvable" }, { status: 404 });
    }

    // Vérifier permission dans l'église du rôle existant
    const patchSession = await requireChurchPermission("events:manage", existing.churchId);
    requireRateLimit(request, { prefix: `roles:${patchSession.user.id}`, ...RATE_LIMIT_SENSITIVE });

    // Vérifier que le ministryId appartient à cette église
    if (ministryId) {
      const ministry = await prisma.ministry.findUnique({
        where: { id: ministryId },
        select: { churchId: true },
      });
      if (!ministry || ministry.churchId !== existing.churchId) {
        throw new ApiError(400, "Ce ministère n'appartient pas à cette église");
      }
    }

    const depts = normalizeDepts(departments, departmentIds);

    // Vérifier que les départements appartiennent à cette église
    if (depts?.length) {
      const deptRecords = await prisma.department.findMany({
        where: { id: { in: depts.map((d) => d.id) } },
        include: { ministry: { select: { churchId: true } } },
      });
      for (const dept of deptRecords) {
        if (dept.ministry.churchId !== existing.churchId) {
          throw new ApiError(400, `Le département "${dept.name}" n'appartient pas à cette église`);
        }
      }
      if (deptRecords.length !== depts.length) {
        throw new ApiError(400, "Un ou plusieurs départements sont introuvables");
      }
    }

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

    await logAudit({ userId: patchSession.user.id, churchId: existing.churchId, action: "UPDATE", entityType: "UserRole", entityId: roleId, details: { targetUserId: userId, ministryId } });

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
    const { userId } = await params;
    const body = await request.json();
    const { churchId, role } = roleSchema.parse(body);

    // Vérifier permission dans l'église ciblée
    const delSession = await requireChurchPermission("events:manage", churchId);
    requireRateLimit(request, { prefix: `roles:${delSession.user.id}`, ...RATE_LIMIT_SENSITIVE });

    // Block deletion of privileged roles by non-super-admins
    if (PRIVILEGED_ROLES.includes(role as typeof PRIVILEGED_ROLES[number])) {
      if (!delSession.user.isSuperAdmin) {
        throw new ApiError(403, "Droits insuffisants pour supprimer ce rôle");
      }
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.userChurchRole.findUnique({
        where: { userId_churchId_role: { userId, churchId, role } },
      });

      if (!existing) throw new Error("Rôle introuvable");

      await tx.userDepartment.deleteMany({ where: { userChurchRoleId: existing.id } });
      await tx.userChurchRole.delete({ where: { id: existing.id } });
    });

    await logAudit({ userId: delSession.user.id, churchId, action: "DELETE", entityType: "UserRole", entityId: `${userId}:${role}`, details: { targetUserId: userId, role } });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
