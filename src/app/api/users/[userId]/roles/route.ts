import { prisma } from "@/lib/prisma";
import { requireChurchPermission, getUserMinistryScope, hasChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { requireRateLimit, RATE_LIMIT_SENSITIVE } from "@/lib/rate-limit";
import { ASSIGNABLE_BY_MINISTER, canGrantRole } from "@/lib/roles";
import type { Prisma, Role } from "@/generated/prisma/client";
import { roleSchema, patchSchema } from "./contract";

// { id, isDeputy? } — format enrichi pour gérer principal vs adjoint

const roleInclude = {
  church: { select: { id: true, name: true } },
  ministry: { select: { id: true, name: true } },
  departments: {
    include: { department: { select: { id: true, name: true } } },
  },
} as const;

type MinistryScope = ReturnType<typeof getUserMinistryScope>;

/**
 * Jette si un appelant au périmètre de ministère restreint agit hors de son périmètre :
 * rôle non rattachable, ministère hors périmètre, ou département dont le ministère est
 * hors périmètre. STAR n'a volontairement aucune vérification supplémentaire ici : la
 * chaîne d'appartenance (Member → département) n'est pas fusionnée avec le périmètre de
 * responsabilité (décision actée dans spec.md).
 */
function assertRoleWithinMinistryScope(
  scope: MinistryScope,
  role: string,
  ministryId: string | null | undefined,
  deptMinistryIds: string[]
): void {
  if (!scope.scoped) return;

  if (!ASSIGNABLE_BY_MINISTER.includes(role as Role)) {
    throw new ApiError(403, "Droits insuffisants pour attribuer ce rôle");
  }
  if (role === "MINISTER" && (!ministryId || !scope.ministryIds.includes(ministryId))) {
    throw new ApiError(403, "Ce ministère ne relève pas de votre périmètre");
  }
  if (
    role === "DEPARTMENT_HEAD" &&
    (deptMinistryIds.length === 0 ||
      deptMinistryIds.some((id) => !scope.ministryIds.includes(id)))
  ) {
    throw new ApiError(403, "Un ou plusieurs départements ne relèvent pas de votre périmètre");
  }
}

// Normalise les deux formats d'entrée vers { id, isDeputy }[]
function normalizeDepts(
  departments?: { id: string; isDeputy?: boolean }[],
  departmentIds?: string[]
): { id: string; isDeputy: boolean }[] | undefined {
  if (departments?.length) return departments.map((d) => ({ id: d.id, isDeputy: d.isDeputy ?? false }));
  if (departmentIds?.length) return departmentIds.map((id) => ({ id, isDeputy: false }));
  return undefined;
}

async function assertMinistryInChurch(ministryId: string, churchId: string) {
  const ministry = await prisma.ministry.findUnique({ where: { id: ministryId }, select: { churchId: true } });
  if (ministry?.churchId !== churchId) {
    throw new ApiError(400, "Ce ministère n'appartient pas à cette église");
  }
}

/**
 * Ministères des départements demandés, après avoir vérifié qu'ils existent tous et
 * appartiennent à l'église. `order` reproduit l'ordre historique des deux contrôles de chaque
 * route : il décide du message quand les deux échouent.
 */
async function deptMinistryIdsInChurch(
  depts: { id: string }[],
  churchId: string,
  order: "count-first" | "church-first"
): Promise<string[]> {
  const deptRecords = await prisma.department.findMany({
    where: { id: { in: depts.map((d) => d.id) } },
    include: { ministry: { select: { churchId: true } } },
  });
  const assertCount = () => {
    if (deptRecords.length !== depts.length) {
      throw new ApiError(400, "Un ou plusieurs départements sont introuvables");
    }
  };
  if (order === "count-first") assertCount();
  const foreign = deptRecords.find((dept) => dept.ministry.churchId !== churchId);
  if (foreign) throw new ApiError(400, `Le département "${foreign.name}" n'appartient pas à cette église`);
  if (order === "church-first") assertCount();
  return deptRecords.map((d) => d.ministryId);
}

/**
 * Un Ministre au périmètre restreint ne peut toucher que les rôles déjà dans son ministère
 * (état courant) — vérifié avant toute donnée nouvelle (spec 031).
 */
async function assertCurrentRoleInScope(
  scope: MinistryScope,
  existing: { id: string; role: Role; ministryId: string | null }
) {
  let currentDeptMinistryIds: string[] = [];
  if (existing.role === "DEPARTMENT_HEAD") {
    const currentDepts = await prisma.userDepartment.findMany({
      where: { userChurchRoleId: existing.id },
      select: { department: { select: { ministryId: true } } },
    });
    currentDeptMinistryIds = currentDepts.map((d) => d.department.ministryId);
  }
  assertRoleWithinMinistryScope(scope, existing.role, existing.ministryId, currentDeptMinistryIds);
}

async function replaceRoleDepartments(
  tx: Prisma.TransactionClient,
  roleId: string,
  depts: { id: string; isDeputy: boolean }[]
) {
  await tx.userDepartment.deleteMany({ where: { userChurchRoleId: roleId } });
  if (depts.length > 0) {
    await tx.userDepartment.createMany({
      data: depts.map(({ id: departmentId, isDeputy }) => ({ userChurchRoleId: roleId, departmentId, isDeputy })),
    });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const body = await request.json();
    const { churchId, role, ministryId, departmentIds, departments } = roleSchema.parse(body);

    // Vérifier permission dans l'église ciblée. access:manage couvre SUPER_ADMIN, ADMIN,
    // SECRETARY et MINISTER (borné à son ministère, voir assertRoleWithinMinistryScope) —
    // décision v1.0 : SECRETARY peut gérer les rôles non-privilégiés (MINISTER, DEPARTMENT_HEAD,
    // DISCIPLE_MAKER, REPORTER, STAR) — rôle de confiance élevée, bras droit de l'admin.
    const session = await requireChurchPermission("access:manage", churchId);
    requireRateLimit(request, { prefix: `roles:${session.user.id}`, ...RATE_LIMIT_SENSITIVE });

    // Admin et Secrétaire : access:admins dans l'église ; Super Admin : un Super Admin seulement
    const canGrantChurchAdmins = await hasChurchPermission(session, "access:admins", churchId);
    if (!canGrantRole(role as Role, { isSuperAdmin: session.user.isSuperAdmin, canGrantChurchAdmins })) {
      throw new ApiError(403, "Droits insuffisants pour attribuer ce rôle");
    }

    // Vérifier que le ministryId appartient à cette église
    if (ministryId) await assertMinistryInChurch(ministryId, churchId);

    // Scope enforcement: MINISTER must have a ministry, DEPARTMENT_HEAD must have departments
    if (role === "MINISTER" && !ministryId) {
      throw new ApiError(400, "Le rôle Ministre requiert un ministère assigné");
    }

    const depts = normalizeDepts(departments, departmentIds);

    if (role === "DEPARTMENT_HEAD" && (!depts || depts.length === 0)) {
      throw new ApiError(400, "Le rôle Responsable de département requiert au moins un département assigné");
    }

    // Vérifier que les départements appartiennent à cette église
    const deptMinistryIds = depts?.length ? await deptMinistryIdsInChurch(depts, churchId, "count-first") : [];

    // Un Ministre au périmètre restreint ne peut attribuer que des rôles rattachables,
    // dans son propre ministère (spec 031, issue #467)
    assertRoleWithinMinistryScope(
      getUserMinistryScope(session, churchId),
      role,
      ministryId,
      deptMinistryIds
    );

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

    // Only notify when assigning to someone else
    if (userId !== session.user.id) {
      createNotification({
        userId,
        domain: "account",
        type: "ROLE_ASSIGNED",
        title: "Nouveau rôle attribué",
        message: `Le rôle ${role} vous a été attribué dans cette église.`,
        link: "/profile",
      }).catch(() => {});
    }

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
    const patchSession = await requireChurchPermission("access:manage", existing.churchId);
    requireRateLimit(request, { prefix: `roles:${patchSession.user.id}`, ...RATE_LIMIT_SENSITIVE });

    // Scope enforcement : ministryId uniquement pour MINISTER, departments pour DEPARTMENT_HEAD
    if (ministryId !== undefined && existing.role !== "MINISTER") {
      throw new ApiError(400, "ministryId n'est applicable qu'au rôle Ministre");
    }
    if ((departments?.length || departmentIds?.length) && existing.role !== "DEPARTMENT_HEAD") {
      throw new ApiError(400, "departments n'est applicable qu'au rôle Responsable de département");
    }

    // Un Ministre au périmètre restreint ne peut toucher que les rôles déjà dans son
    // ministère (état courant) — vérifié avant toute donnée nouvelle (spec 031)
    const ministryScope = getUserMinistryScope(patchSession, existing.churchId);
    if (ministryScope.scoped) await assertCurrentRoleInScope(ministryScope, existing);

    // Vérifier que le ministryId appartient à cette église
    if (ministryId) await assertMinistryInChurch(ministryId, existing.churchId);

    const depts = normalizeDepts(departments, departmentIds);

    // Vérifier que les départements appartiennent à cette église
    const newDeptMinistryIds = depts?.length
      ? await deptMinistryIdsInChurch(depts, existing.churchId, "church-first")
      : [];

    // Le résultat de la modification doit lui aussi rester dans le périmètre — un Ministre
    // ne peut pas déplacer un responsable vers un ministère qui n'est pas le sien. Seuls les
    // champs effectivement modifiés sont revérifiés ; un champ non touché reste régi par le
    // contrôle sur l'état courant fait plus haut.
    if (ministryScope.scoped && ministryId !== undefined) {
      assertRoleWithinMinistryScope(ministryScope, existing.role, ministryId, []);
    }
    if (ministryScope.scoped && depts !== undefined) {
      assertRoleWithinMinistryScope(ministryScope, existing.role, undefined, newDeptMinistryIds);
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (ministryId !== undefined) {
        await tx.userChurchRole.update({ where: { id: roleId }, data: { ministryId } });
      }
      if (depts !== undefined) await replaceRoleDepartments(tx, roleId, depts);
      return tx.userChurchRole.findUnique({ where: { id: roleId }, include: roleInclude });
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
    const delSession = await requireChurchPermission("access:manage", churchId);
    requireRateLimit(request, { prefix: `roles:${delSession.user.id}`, ...RATE_LIMIT_SENSITIVE });

    // Même règle qu'à l'attribution (canGrantRole)
    const delCanGrantChurchAdmins = await hasChurchPermission(delSession, "access:admins", churchId);
    if (!canGrantRole(role as Role, { isSuperAdmin: delSession.user.isSuperAdmin, canGrantChurchAdmins: delCanGrantChurchAdmins })) {
      throw new ApiError(403, "Droits insuffisants pour supprimer ce rôle");
    }

    const delMinistryScope = getUserMinistryScope(delSession, churchId);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.userChurchRole.findUnique({
        where: { userId_churchId_role: { userId, churchId, role } },
      });

      if (!existing) throw new Error("Rôle introuvable");

      // Un Ministre au périmètre restreint ne peut supprimer que les rôles de son ministère
      if (delMinistryScope.scoped) {
        let currentDeptMinistryIds: string[] = [];
        if (existing.role === "DEPARTMENT_HEAD") {
          const currentDepts = await tx.userDepartment.findMany({
            where: { userChurchRoleId: existing.id },
            select: { department: { select: { ministryId: true } } },
          });
          currentDeptMinistryIds = currentDepts.map((d) => d.department.ministryId);
        }
        assertRoleWithinMinistryScope(
          delMinistryScope,
          existing.role,
          existing.ministryId,
          currentDeptMinistryIds
        );
      }

      await tx.userDepartment.deleteMany({ where: { userChurchRoleId: existing.id } });
      await tx.userChurchRole.delete({ where: { id: existing.id } });
    });

    await logAudit({ userId: delSession.user.id, churchId, action: "DELETE", entityType: "UserRole", entityId: `${userId}:${role}`, details: { targetUserId: userId, role } });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
