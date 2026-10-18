import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma/client";
import { getUserDepartmentScope, getUserMinistryScope, hasChurchPermission } from "@/lib/auth";
import { ApiError } from "@/lib/api-utils";
import { DEPT_FN } from "@/lib/department-functions";
import { prisma } from "@/lib/prisma";

export type MemberScope = { scoped: false } | { scoped: true; departmentIds: string[] };

/**
 * Périmètre de gestion des STAR dans une église.
 *
 * Part de `getUserDepartmentScope` (responsabilité explicite via `user_departments`) et y ajoute,
 * pour un Ministre, les départements de ses ministères : sans cela un Ministre a un périmètre vide
 * et ne voit aucun STAR, alors qu'il gère bien les départements de son ministère.
 * Reste un périmètre de responsabilité — aucune fusion avec l'appartenance (ADR-0009/ADR-0013).
 */
export async function resolveMemberDepartmentScope(
  session: Session,
  churchId: string
): Promise<MemberScope> {
  const deptScope = getUserDepartmentScope(session, churchId);
  if (!deptScope.scoped) return { scoped: false };

  const ministryScope = getUserMinistryScope(session, churchId);
  if (!ministryScope.scoped || ministryScope.ministryIds.length === 0) {
    return { scoped: true, departmentIds: deptScope.departmentIds };
  }

  const ministryDepts = await prisma.department.findMany({
    where: { ministryId: { in: ministryScope.ministryIds } },
    select: { id: true },
  });

  return {
    scoped: true,
    departmentIds: Array.from(
      new Set([...deptScope.departmentIds, ...ministryDepts.map((d) => d.id)])
    ),
  };
}

/**
 * Rattacher une fiche à un département de fonction Secrétariat donne au compte qui y est lié le
 * rôle virtuel Secrétaire (cf. `loadStarDepartments` dans `@/lib/auth`). Ce geste est donc une
 * attribution d'accès, pas une simple affiliation : il exige `access:admins`, comme l'attribution
 * du rôle Secrétaire elle-même (`canGrantRole`). Sans département Secrétariat dans la liste, rien
 * n'est exigé.
 */
export async function assertCanAffiliateToSecretariat(
  session: Session,
  churchId: string,
  departmentIds: string[]
): Promise<void> {
  if (departmentIds.length === 0) return;
  await assertSecretariatGrant(session, churchId, { id: { in: departmentIds } });
}

async function assertSecretariatGrant(
  session: Session,
  churchId: string,
  target: Prisma.DepartmentWhereInput
): Promise<void> {
  const secretariat = await prisma.department.count({
    where: { AND: [target, { function: DEPT_FN.SECRETARIAT }] },
  });
  if (!secretariat) return;
  if (await hasChurchPermission(session, "access:admins", churchId)) return;
  throw new ApiError(
    403,
    "Rattacher un STAR au Secrétariat lui donne les droits de Secrétaire : ce geste est réservé à l'administration de l'église"
  );
}

/**
 * Lier un compte à une fiche du Secrétariat (existante ou créée dans le même geste) donne à ce
 * compte les droits de Secrétaire : même exigence que `assertCanAffiliateToSecretariat`.
 */
export async function assertCanLinkAccountToMember(
  session: Session,
  churchId: string,
  target: { memberId?: string | null; departmentId?: string | null }
): Promise<void> {
  const or: Prisma.DepartmentWhereInput[] = [];
  if (target.departmentId) or.push({ id: target.departmentId });
  if (target.memberId) or.push({ memberDepts: { some: { memberId: target.memberId } } });
  if (or.length === 0) return;
  await assertSecretariatGrant(session, churchId, { OR: or });
}

/**
 * Vrai si un appelant restreint partage au moins un département avec la fiche visée — même
 * règle que `PATCH /api/members/[memberId]` (spec 054/#583, défaut B1-B3 de `audit-rbac.md`).
 * Un appelant non restreint (Admin, Secrétaire, Super Admin) voit toujours vrai.
 */
export function isMemberInScope(scope: MemberScope, memberDepartmentIds: string[]): boolean {
  if (!scope.scoped) return true;
  return memberDepartmentIds.some((id) => scope.departmentIds.includes(id));
}

/**
 * Vrai si **tous** les départements de la fiche visée sont dans le périmètre de l'appelant.
 * Plus strict que `isMemberInScope` : réservé aux gestes qui font disparaître une fiche ou
 * déplacent ses affiliations (fusion), où un département partagé hors périmètre engagerait un
 * autre responsable (plan.md, « Décisions »).
 */
export function isMemberFullyInScope(scope: MemberScope, memberDepartmentIds: string[]): boolean {
  if (!scope.scoped) return true;
  return memberDepartmentIds.every((id) => scope.departmentIds.includes(id));
}

export type LinkRequestScopeInput = {
  departmentId: string | null;
  ministryId: string | null;
};

/**
 * Vrai si une demande d'accès (ou de liaison) est dans le périmètre de l'appelant : son
 * département demandé est géré par l'appelant, ou son ministère demandé est un des siens, ou la
 * fiche STAR déjà existante (`memberDepartmentIds`) partage un département avec lui.
 * `ministryIds` vient de `getUserMinistryScope` — un appelant restreint qui atteint cette
 * fonction est nécessairement un Ministre (seul rôle restreint à détenir `access:manage`).
 */
export function isLinkRequestInScope(
  scope: MemberScope,
  ministryIds: string[],
  request: LinkRequestScopeInput,
  memberDepartmentIds: string[] = []
): boolean {
  if (!scope.scoped) return true;
  if (request.departmentId && scope.departmentIds.includes(request.departmentId)) return true;
  if (request.ministryId && ministryIds.includes(request.ministryId)) return true;
  return isMemberInScope(scope, memberDepartmentIds);
}
