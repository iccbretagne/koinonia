import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { resolveMemberDepartmentScope } from "@/lib/member-scope";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { findDuplicateCandidates } from "@/lib/onboarding";
import type { z } from "zod";
import { bulkSchema, createSchema } from "./contract";

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

    // Périmètre de gestion : responsabilité explicite + départements du ministère (Ministre)
    const scope = await resolveMemberDepartmentScope(session, churchId);
    const scopedDeptIds = scope.scoped ? scope.departmentIds : null;

    if (scopedDeptIds && departmentId && !scopedDeptIds.includes(departmentId)) {
      throw new ApiError(403, "Accès refusé à ce département");
    }

    let departmentFilter;
    if (departmentId) {
      departmentFilter = { departmentId };
    } else if (scopedDeptIds) {
      departmentFilter = { departmentId: { in: scopedDeptIds } };
    } else {
      departmentFilter = { department: { ministry: { churchId } } };
    }

    const members = await prisma.member.findMany({
      where: {
        departments: {
          some: departmentFilter,
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


type BulkInput = z.infer<typeof bulkSchema>;

/** Église commune à tous les STAR visés (celle du premier fait autorité). */
async function resolveBulkChurchId(ids: string[]) {
  const { resolveChurchId } = await import("@/lib/auth");
  const churchId = await resolveChurchId("member", ids[0]);
  if (ids.length > 1) {
    const allChurchIds = await Promise.all(ids.map((id) => resolveChurchId("member", id)));
    if (allChurchIds.some((cid) => cid !== churchId)) {
      throw new ApiError(400, "Tous les STAR doivent appartenir à la même église");
    }
  }
  return churchId;
}

/** Périmètre restreint : supprimer exige des STAR entièrement dedans, modifier un département partagé. */
async function assertBulkInScope(
  ids: string[],
  action: BulkInput["action"],
  data: BulkInput["data"],
  manageable: Set<string>
) {
  const members = await prisma.member.findMany({
    where: { id: { in: ids } },
    include: { departments: { select: { departmentId: true } } },
  });

  if (action === "delete") {
    // Supprimer efface toutes les affiliations : réservé aux STAR exclusivement dans le périmètre
    const allFullyInScope = members.every(
      (m) => m.departments.length > 0 && m.departments.every((d) => manageable.has(d.departmentId))
    );
    if (!allFullyInScope) {
      throw new ApiError(
        403,
        "Certains STAR appartiennent à des départements hors de votre périmètre et ne peuvent pas être supprimés"
      );
    }
    return;
  }
  // Modifier : autorisé dès qu'au moins un département est partagé avec l'utilisateur
  const allShareScope = members.every((m) => m.departments.some((d) => manageable.has(d.departmentId)));
  if (!allShareScope) {
    throw new ApiError(403, "Certains STAR sont hors de votre périmètre");
  }
  if (data?.primaryDepartmentId && !manageable.has(data.primaryDepartmentId)) {
    throw new ApiError(403, "Département cible non autorisé");
  }
}

async function bulkDelete(ids: string[]) {
  await prisma.$transaction(async (tx) => {
    await tx.planning.deleteMany({ where: { memberId: { in: ids } } });
    await tx.taskAssignment.deleteMany({ where: { memberId: { in: ids } } });
    await tx.discipleshipAttendance.deleteMany({ where: { memberId: { in: ids } } });
    await tx.memberUserLink.deleteMany({ where: { memberId: { in: ids } } });
    await tx.memberLinkRequest.updateMany({ where: { memberId: { in: ids } }, data: { memberId: null } });
    await tx.discipleship.deleteMany({ where: { OR: [{ discipleId: { in: ids } }, { discipleMakerId: { in: ids } }, { firstMakerId: { in: ids } }] } });
    await tx.member.deleteMany({ where: { id: { in: ids } } });
  });
}

async function bulkUpdate(ids: string[], data: NonNullable<BulkInput["data"]>, churchId: string) {
  const { primaryDepartmentId, ...scalarData } = data;

  // Block cross-tenant destination
  if (primaryDepartmentId) {
    const targetDept = await prisma.department.findUnique({
      where: { id: primaryDepartmentId },
      include: { ministry: { select: { churchId: true } } },
    });
    if (targetDept?.ministry.churchId !== churchId) {
      throw new ApiError(403, "Le département cible n'appartient pas à la même église");
    }
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(scalarData).length > 0) {
      await tx.member.updateMany({ where: { id: { in: ids } }, data: scalarData });
    }
    if (!primaryDepartmentId) return;
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
  });
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { ids, action, data } = bulkSchema.parse(body);

    // Résoudre l'église à partir du premier membre
    if (ids.length === 0) throw new ApiError(400, "Au moins un ID requis");
    const firstMemberChurchId = await resolveBulkChurchId(ids);

    const session = await requireChurchPermission("members:manage", firstMemberChurchId);
    requireRateLimit(request, { prefix: `mut:${session.user.id}`, ...RATE_LIMIT_MUTATION });

    // Périmètre de gestion : responsabilité explicite + départements du ministère (Ministre)
    const scope = await resolveMemberDepartmentScope(session, firstMemberChurchId);
    if (scope.scoped) {
      await assertBulkInScope(ids, action, data, new Set(scope.departmentIds));
    }

    if (action === "delete") {
      await bulkDelete(ids);
      for (const id of ids) {
        await logAudit({ userId: session.user.id, churchId: firstMemberChurchId, action: "DELETE", entityType: "Member", entityId: id });
      }
      return successResponse({ deleted: ids.length });
    }

    if (!data || Object.keys(data).length === 0) {
      return errorResponse(new Error("Aucune donnée à mettre à jour"));
    }

    await bulkUpdate(ids, data, firstMemberChurchId);

    for (const id of ids) {
      await logAudit({ userId: session.user.id, churchId: firstMemberChurchId, action: "UPDATE", entityType: "Member", entityId: id, details: data });
    }
    return successResponse({ updated: ids.length });
  } catch (error) {
    return errorResponse(error);
  }
}


export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { departmentId, additionalDepartmentIds = [], confirmDuplicate, ...memberData } = createSchema.parse(body);

    // Résoudre l'église du département cible
    const { resolveChurchId } = await import("@/lib/auth");
    const deptChurchId = await resolveChurchId("department", departmentId);
    const session = await requireChurchPermission("members:manage", deptChurchId);
    requireRateLimit(request, { prefix: `mut:${session.user.id}`, ...RATE_LIMIT_MUTATION });

    // Périmètre de gestion : responsabilité explicite + départements du ministère (Ministre)
    const scope = await resolveMemberDepartmentScope(session, deptChurchId);
    const scopedDeptIds = scope.scoped ? scope.departmentIds : null;

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

    if (!confirmDuplicate) {
      const duplicates = await findDuplicateCandidates(deptChurchId, {
        email: memberData.email,
        firstName: memberData.firstName,
        lastName: memberData.lastName,
      });
      if (duplicates.length > 0) {
        return successResponse({ duplicates }, 409);
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
