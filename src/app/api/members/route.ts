import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { z } from "zod";

// Helper : inclure les départements d'un membre (principal en premier)
const memberDepartmentsInclude = {
  departments: {
    include: {
      department: {
        select: { id: true, name: true, ministry: { select: { id: true, name: true } } },
      },
    },
    orderBy: { isPrimary: "desc" as const },
  },
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get("departmentId");
    const churchId = searchParams.get("churchId");

    if (!churchId) throw new ApiError(400, "churchId requis");
    const session = await requireChurchPermission("members:view", churchId);

    // Scope par département : seuls les rôles dans cette église comptent
    const churchRoles = session.user.churchRoles.filter((r) => r.churchId === churchId);
    const GLOBAL_ROLES = ["SUPER_ADMIN", "ADMIN", "SECRETARY"];
    const hasGlobalRole = session.user.isSuperAdmin || churchRoles.some((r) => GLOBAL_ROLES.includes(r.role));
    const scopedDeptIds = hasGlobalRole
      ? null
      : Array.from(new Set(churchRoles.flatMap((r) => r.departments.map((d) => d.department.id))));

    if (scopedDeptIds && departmentId && !scopedDeptIds.includes(departmentId)) {
      throw new ApiError(403, "Accès refusé à ce département");
    }

    const members = await prisma.member.findMany({
      where: {
        departments: {
          some: departmentId
            ? { departmentId }
            : scopedDeptIds
              ? { departmentId: { in: scopedDeptIds } }
              : { department: { ministry: { churchId } } },
        },
      },
      include: memberDepartmentsInclude,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return successResponse(members);
  } catch (error) {
    return errorResponse(error);
  }
}

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1, "Au moins un ID requis"),
  action: z.enum(["delete", "update"]),
  data: z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    primaryDepartmentId: z.string().min(1).optional(),
  }).optional(),
});

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { ids, action, data } = bulkSchema.parse(body);

    // Résoudre l'église à partir du premier membre
    if (ids.length === 0) throw new ApiError(400, "Au moins un ID requis");
    const { resolveChurchId } = await import("@/lib/auth");
    const firstMemberChurchId = await resolveChurchId("member", ids[0]);

    // Verify ALL ids belong to the same church
    if (ids.length > 1) {
      const allChurchIds = await Promise.all(ids.map((id) => resolveChurchId("member", id)));
      if (allChurchIds.some((cid) => cid !== firstMemberChurchId)) {
        throw new ApiError(400, "Tous les STAR doivent appartenir à la même église");
      }
    }

    const session = await requireChurchPermission("members:manage", firstMemberChurchId);
    requireRateLimit(request, { prefix: `mut:${session.user.id}`, ...RATE_LIMIT_MUTATION });

    // Scope par département dans cette église
    const churchRoles = session.user.churchRoles.filter((r) => r.churchId === firstMemberChurchId);
    const GLOBAL_ROLES = ["SUPER_ADMIN", "ADMIN", "SECRETARY"];
    const hasGlobalRole = session.user.isSuperAdmin || churchRoles.some((r) => GLOBAL_ROLES.includes(r.role));
    const scopedDeptIds = hasGlobalRole
      ? null
      : Array.from(new Set(churchRoles.flatMap((r) => r.departments.map((d) => d.department.id))));

    if (scopedDeptIds) {
      const members = await prisma.member.findMany({
        where: { id: { in: ids } },
        include: { departments: { where: { isPrimary: true }, select: { departmentId: true } } },
      });

      const allInScope = members.every((m) => {
        const primaryDeptId = m.departments[0]?.departmentId;
        return primaryDeptId ? scopedDeptIds.includes(primaryDeptId) : false;
      });
      if (!allInScope) {
        throw new ApiError(403, "Certains STAR sont hors de votre périmètre");
      }

      if (action === "update" && data?.primaryDepartmentId && !scopedDeptIds.includes(data.primaryDepartmentId)) {
        throw new ApiError(403, "Département cible non autorisé");
      }
    }

    if (action === "delete") {
      await prisma.$transaction(async (tx) => {
        await tx.planning.deleteMany({ where: { memberId: { in: ids } } });
        await tx.taskAssignment.deleteMany({ where: { memberId: { in: ids } } });
        await tx.discipleshipAttendance.deleteMany({ where: { memberId: { in: ids } } });
        await tx.memberUserLink.deleteMany({ where: { memberId: { in: ids } } });
        await tx.memberLinkRequest.updateMany({ where: { memberId: { in: ids } }, data: { memberId: null } });
        await tx.discipleship.deleteMany({ where: { OR: [{ discipleId: { in: ids } }, { discipleMakerId: { in: ids } }, { firstMakerId: { in: ids } }] } });
        await tx.member.deleteMany({ where: { id: { in: ids } } });
      });
      for (const id of ids) {
        await logAudit({ userId: session.user.id, churchId: firstMemberChurchId, action: "DELETE", entityType: "Member", entityId: id });
      }
      return successResponse({ deleted: ids.length });
    }

    if (!data || Object.keys(data).length === 0) {
      return errorResponse(new Error("Aucune donnée à mettre à jour"));
    }

    const { primaryDepartmentId, ...scalarData } = data;

    // Block cross-tenant destination
    if (primaryDepartmentId) {
      const targetDept = await prisma.department.findUnique({
        where: { id: primaryDepartmentId },
        include: { ministry: { select: { churchId: true } } },
      });
      if (!targetDept || targetDept.ministry.churchId !== firstMemberChurchId) {
        throw new ApiError(403, "Le département cible n'appartient pas à la même église");
      }
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(scalarData).length > 0) {
        await tx.member.updateMany({ where: { id: { in: ids } }, data: scalarData });
      }
      if (primaryDepartmentId) {
        for (const memberId of ids) {
          // Retirer le flag isPrimary de l'ancien département principal
          await tx.memberDepartment.updateMany({
            where: { memberId, isPrimary: true },
            data: { isPrimary: false },
          });
          // Upsert le nouveau département principal
          await tx.memberDepartment.upsert({
            where: { memberId_departmentId: { memberId, departmentId: primaryDepartmentId } },
            update: { isPrimary: true },
            create: { memberId, departmentId: primaryDepartmentId, isPrimary: true },
          });
        }
      }
    });

    for (const id of ids) {
      await logAudit({ userId: session.user.id, churchId: firstMemberChurchId, action: "UPDATE", entityType: "Member", entityId: id, details: data });
    }
    return successResponse({ updated: ids.length });
  } catch (error) {
    return errorResponse(error);
  }
}

const createSchema = z.object({
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  departmentId: z.string().min(1, "Le département principal est requis"),
  additionalDepartmentIds: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { departmentId, additionalDepartmentIds = [], ...memberData } = createSchema.parse(body);

    // Résoudre l'église du département cible
    const { resolveChurchId } = await import("@/lib/auth");
    const deptChurchId = await resolveChurchId("department", departmentId);
    const session = await requireChurchPermission("members:manage", deptChurchId);
    requireRateLimit(request, { prefix: `mut:${session.user.id}`, ...RATE_LIMIT_MUTATION });

    // Scope par département dans cette église
    const churchRoles = session.user.churchRoles.filter((r) => r.churchId === deptChurchId);
    const GLOBAL_ROLES = ["SUPER_ADMIN", "ADMIN", "SECRETARY"];
    const hasGlobalRole = session.user.isSuperAdmin || churchRoles.some((r) => GLOBAL_ROLES.includes(r.role));
    const scopedDeptIds = hasGlobalRole
      ? null
      : Array.from(new Set(churchRoles.flatMap((r) => r.departments.map((d) => d.department.id))));

    if (scopedDeptIds && !scopedDeptIds.includes(departmentId)) {
      throw new ApiError(403, "Vous ne pouvez pas créer un STAR dans ce département");
    }

    // Valider que tous les départements supplémentaires appartiennent à la même église
    const allDeptIds = [departmentId, ...additionalDepartmentIds.filter((id) => id !== departmentId)];
    if (additionalDepartmentIds.length > 0) {
      const depts = await prisma.department.findMany({
        where: { id: { in: allDeptIds } },
        include: { ministry: { select: { churchId: true } } },
      });
      const wrongChurch = depts.some((d) => d.ministry.churchId !== deptChurchId);
      if (wrongChurch || depts.length !== allDeptIds.length) {
        throw new ApiError(400, "Tous les départements doivent appartenir à la même église");
      }
    }

    const member = await prisma.member.create({
      data: {
        ...memberData,
        departments: {
          create: allDeptIds.map((id) => ({ departmentId: id, isPrimary: id === departmentId })),
        },
      },
      include: memberDepartmentsInclude,
    });

    await logAudit({ userId: session.user.id, churchId: deptChurchId, action: "CREATE", entityType: "Member", entityId: member.id, details: { firstName: memberData.firstName, lastName: memberData.lastName } });

    return successResponse(member, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
