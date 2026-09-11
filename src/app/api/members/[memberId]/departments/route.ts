import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { resolveMemberDepartmentScope } from "@/lib/member-scope";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

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

const addSchema = z.object({ departmentId: z.string().min(1, "Le département est requis") });

/**
 * Rattache un STAR existant à un département.
 *
 * Le PUT de la fiche STAR ne permet pas ce geste à un périmètre restreint : il ne liste que les
 * STAR déjà visibles. Ici le STAR peut venir de n'importe quel département de l'église, seul le
 * département de destination doit appartenir au périmètre de l'appelant.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const { memberId } = await params;
    const { departmentId } = addSchema.parse(await request.json());

    const churchId = await resolveChurchId("department", departmentId);
    const session = await requireChurchPermission("members:manage", churchId);
    const scope = await resolveMemberDepartmentScope(session, churchId);
    if (scope.scoped && !scope.departmentIds.includes(departmentId)) {
      throw new ApiError(403, "Ce département n'est pas dans votre périmètre");
    }

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      include: {
        departments: {
          select: { departmentId: true, department: { select: { ministry: { select: { churchId: true } } } } },
        },
      },
    });
    if (!member) throw new ApiError(404, "STAR introuvable");
    if (member.departments.some((d) => d.department.ministry.churchId !== churchId)) {
      throw new ApiError(403, "Ce STAR n'appartient pas à cette église");
    }
    if (member.departments.some((d) => d.departmentId === departmentId)) {
      throw new ApiError(409, "Ce STAR appartient déjà à ce département");
    }

    await prisma.memberDepartment.create({
      data: { memberId, departmentId, isPrimary: member.departments.length === 0 },
    });

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "UPDATE",
      entityType: "Member",
      entityId: memberId,
      details: { addedDepartmentId: departmentId },
    });

    return successResponse(
      await prisma.member.findUnique({ where: { id: memberId }, include: memberDepartmentsInclude })
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Retire un STAR d'un département sans supprimer sa fiche.
 *
 * Le DELETE de la fiche refuse un STAR partiellement hors périmètre ; c'est ici que se fait le
 * retrait ciblé. Refusé sur la dernière affiliation : un STAR sans département n'appartiendrait
 * plus à aucune église.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const { memberId } = await params;
    const departmentId = new URL(request.url).searchParams.get("departmentId");
    if (!departmentId) throw new ApiError(400, "departmentId requis");

    const churchId = await resolveChurchId("member", memberId);
    const session = await requireChurchPermission("members:manage", churchId);
    const scope = await resolveMemberDepartmentScope(session, churchId);
    if (scope.scoped && !scope.departmentIds.includes(departmentId)) {
      throw new ApiError(403, "Ce département n'est pas dans votre périmètre");
    }

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      include: { departments: { select: { departmentId: true, isPrimary: true } } },
    });
    if (!member) throw new ApiError(404, "STAR introuvable");

    const target = member.departments.find((d) => d.departmentId === departmentId);
    if (!target) throw new ApiError(404, "Ce STAR n'appartient pas à ce département");
    if (member.departments.length === 1) {
      throw new ApiError(
        400,
        "C'est le seul département de ce STAR : supprimez sa fiche plutôt que de l'en retirer."
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.memberDepartment.deleteMany({ where: { memberId, departmentId } });

      // Le planning et les tâches à venir dans ce département n'ont plus lieu d'être
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await tx.planning.deleteMany({
        where: {
          memberId,
          eventDepartment: { departmentId, event: { date: { gte: today } } },
        },
      });
      await tx.taskAssignment.deleteMany({
        where: { memberId, event: { date: { gte: today } }, task: { departmentId } },
      });

      // Le STAR garde un département principal
      if (target.isPrimary) {
        const next = member.departments.find((d) => d.departmentId !== departmentId)!;
        await tx.memberDepartment.update({
          where: { memberId_departmentId: { memberId, departmentId: next.departmentId } },
          data: { isPrimary: true },
        });
      }
    });

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "UPDATE",
      entityType: "Member",
      entityId: memberId,
      details: { removedDepartmentId: departmentId },
    });

    return successResponse(
      await prisma.member.findUnique({ where: { id: memberId }, include: memberDepartmentsInclude })
    );
  } catch (error) {
    return errorResponse(error);
  }
}
