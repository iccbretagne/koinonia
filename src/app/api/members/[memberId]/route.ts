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

    // Charger le membre avec toutes ses affiliations actuelles
    const existing = await prisma.member.findUnique({
      where: { id: memberId },
      include: { departments: { select: { departmentId: true, isPrimary: true } } },
    });
    if (!existing) throw new ApiError(404, "STAR introuvable");

    // Périmètre géré : null = accès global (admin), sinon ensemble des départements de l'utilisateur
    const manageable = scopedDeptIds ? new Set(scopedDeptIds) : null;

    // Un utilisateur scoped doit partager au moins un département avec le STAR
    if (manageable && !existing.departments.some((d) => manageable.has(d.departmentId))) {
      throw new ApiError(403, "Ce STAR est hors de votre périmètre");
    }

    // Départements soumis (principal + secondaires), dédupliqués
    const submittedIds = Array.from(new Set([departmentId, ...additionalDepartmentIds]));

    // Valider que tous les départements soumis appartiennent à la même église
    const depts = await prisma.department.findMany({
      where: { id: { in: submittedIds } },
      include: { ministry: { select: { churchId: true } } },
    });
    if (depts.length !== submittedIds.length || depts.some((d) => d.ministry.churchId !== churchId)) {
      throw new ApiError(403, "Tous les départements doivent appartenir à la même église");
    }

    // Un utilisateur scoped n'agit que sur SES départements ; les affiliations
    // hors périmètre (y compris un département principal hors scope) sont préservées.
    const preserved = manageable
      ? existing.departments.filter((d) => !manageable.has(d.departmentId))
      : [];
    const submittedManageable = manageable
      ? submittedIds.filter((id) => manageable.has(id))
      : submittedIds;

    const finalIds = Array.from(
      new Set([...preserved.map((d) => d.departmentId), ...submittedManageable])
    );

    // Déterminer le département principal
    let primaryId: string;
    if (manageable) {
      const preservedPrimary = preserved.find((d) => d.isPrimary)?.departmentId;
      // Si le principal est hors périmètre, on le conserve intact ;
      // sinon l'utilisateur choisit le principal parmi ses départements.
      primaryId =
        preservedPrimary ??
        (manageable.has(departmentId) ? departmentId : submittedManageable[0]);
    } else {
      primaryId = departmentId;
    }

    // Départements réellement retirés (uniquement dans le périmètre géré)
    const finalSet = new Set(finalIds);
    const removedIds = existing.departments
      .map((d) => d.departmentId)
      .filter((id) => !finalSet.has(id));

    const member = await prisma.$transaction(async (tx) => {
      // Mettre à jour les champs scalaires
      await tx.member.update({ where: { id: memberId }, data: memberData });

      if (removedIds.length > 0) {
        // 1. Retirer les affiliations retirées
        await tx.memberDepartment.deleteMany({
          where: { memberId, departmentId: { in: removedIds } },
        });

        // Supprimer les affectations planning et tâches futures dans les départements retirés
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        await tx.planning.deleteMany({
          where: {
            memberId,
            eventDepartment: {
              departmentId: { in: removedIds },
              event: { date: { gte: today } },
            },
          },
        });
        await tx.taskAssignment.deleteMany({
          where: {
            memberId,
            event: { date: { gte: today } },
            task: { departmentId: { in: removedIds } },
          },
        });
      }

      // 2. Upsert chaque département final avec le bon flag isPrimary
      for (const deptId of finalIds) {
        await tx.memberDepartment.upsert({
          where: { memberId_departmentId: { memberId, departmentId: deptId } },
          update: { isPrimary: deptId === primaryId },
          create: { memberId, departmentId: deptId, isPrimary: deptId === primaryId },
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
      include: { departments: { select: { departmentId: true } } },
    });

    if (!member) throw new ApiError(404, "STAR introuvable");

    // Supprimer un STAR efface toutes ses affiliations : un utilisateur scoped
    // ne peut le faire que si le STAR appartient exclusivement à ses départements.
    if (scopedDeptIds) {
      const manageable = new Set(scopedDeptIds);
      const fullyInScope =
        member.departments.length > 0 &&
        member.departments.every((d) => manageable.has(d.departmentId));
      if (!fullyInScope) {
        throw new ApiError(
          403,
          "Ce STAR appartient à des départements hors de votre périmètre. Retirez-le de votre département plutôt que de le supprimer."
        );
      }
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
