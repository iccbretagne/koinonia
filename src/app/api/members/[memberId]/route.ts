import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
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

const updateSchema = z.object({
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  departmentId: z.string().min(1, "Le département principal est requis"),
  additionalDepartmentIds: z.array(z.string()).optional(),
  email: z.string().email("Email invalide").nullable().optional(),
  phone: z.string().nullable().optional(),
});

function getChurchDeptScope(session: { user: { isSuperAdmin: boolean; churchRoles: { churchId: string; role: string; departments: { department: { id: string } }[] }[] } }, churchId: string) {
  const churchRoles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  const GLOBAL_ROLES = ["SUPER_ADMIN", "ADMIN", "SECRETARY"];
  const hasGlobalRole = session.user.isSuperAdmin || churchRoles.some((r) => GLOBAL_ROLES.includes(r.role));
  return hasGlobalRole
    ? null
    : Array.from(new Set(churchRoles.flatMap((r) => r.departments.map((d) => d.department.id))));
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const { memberId } = await params;
    const churchId = await resolveChurchId("member", memberId);
    const session = await requireChurchPermission("members:manage", churchId);
    const scopedDeptIds = getChurchDeptScope(session, churchId);
    const body = await request.json();
    const { departmentId, additionalDepartmentIds = [], ...memberData } = updateSchema.parse(body);

    if (scopedDeptIds) {
      const existing = await prisma.member.findUnique({
        where: { id: memberId },
        include: { departments: { where: { isPrimary: true }, select: { departmentId: true } } },
      });

      if (!existing) throw new ApiError(404, "STAR introuvable");

      const primaryDeptId = existing.departments[0]?.departmentId;
      if (!primaryDeptId || !scopedDeptIds.includes(primaryDeptId)) {
        throw new ApiError(403, "Ce STAR est hors de votre périmètre");
      }

      if (!scopedDeptIds.includes(departmentId)) {
        throw new ApiError(403, "Département cible non autorisé");
      }
    }

    // Valider que tous les départements appartiennent à la même église
    const allDeptIds = [departmentId, ...additionalDepartmentIds.filter((id) => id !== departmentId)];
    const depts = await prisma.department.findMany({
      where: { id: { in: allDeptIds } },
      include: { ministry: { select: { churchId: true } } },
    });
    if (depts.length !== allDeptIds.length || depts.some((d) => d.ministry.churchId !== churchId)) {
      throw new ApiError(403, "Tous les départements doivent appartenir à la même église");
    }

    const member = await prisma.$transaction(async (tx) => {
      // Mettre à jour les champs scalaires
      await tx.member.update({ where: { id: memberId }, data: memberData });

      // Reconstruire les affiliations départementales
      // 1. Retirer les affiliations qui ne sont plus dans la liste
      await tx.memberDepartment.deleteMany({
        where: { memberId, departmentId: { notIn: allDeptIds } },
      });
      // 2. Upsert chaque département avec le bon flag isPrimary
      for (const deptId of allDeptIds) {
        await tx.memberDepartment.upsert({
          where: { memberId_departmentId: { memberId, departmentId: deptId } },
          update: { isPrimary: deptId === departmentId },
          create: { memberId, departmentId: deptId, isPrimary: deptId === departmentId },
        });
      }

      return tx.member.findUnique({ where: { id: memberId }, include: memberDepartmentsInclude });
    });

    await logAudit({ userId: session.user.id, churchId, action: "UPDATE", entityType: "Member", entityId: memberId, details: { firstName: memberData.firstName, lastName: memberData.lastName } });

    return successResponse(member);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const { memberId } = await params;
    const churchId = await resolveChurchId("member", memberId);
    const session = await requireChurchPermission("members:manage", churchId);
    const scopedDeptIds = getChurchDeptScope(session, churchId);

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      include: { departments: { where: { isPrimary: true }, select: { departmentId: true } } },
    });

    if (!member) throw new ApiError(404, "STAR introuvable");

    const primaryDeptId = member.departments[0]?.departmentId;
    if (scopedDeptIds && (!primaryDeptId || !scopedDeptIds.includes(primaryDeptId))) {
      throw new ApiError(403, "Ce STAR est hors de votre périmètre");
    }

    // Delete dependent records before member to avoid FK constraint errors
    await prisma.$transaction(async (tx) => {
      await tx.planning.deleteMany({ where: { memberId } });
      await tx.taskAssignment.deleteMany({ where: { memberId } });
      await tx.discipleshipAttendance.deleteMany({ where: { memberId } });
      await tx.memberUserLink.deleteMany({ where: { memberId } });
      await tx.memberLinkRequest.updateMany({ where: { memberId }, data: { memberId: null } });
      await tx.discipleship.deleteMany({ where: { OR: [{ discipleId: memberId }, { discipleMakerId: memberId }, { firstMakerId: memberId }] } });
      await tx.member.delete({ where: { id: memberId } });
    });

    await logAudit({ userId: session.user.id, churchId, action: "DELETE", entityType: "Member", entityId: memberId });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
