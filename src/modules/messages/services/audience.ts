import type { Role } from "@/generated/prisma/enums";
import type { Audience } from "../schemas";

/**
 * Public d'un message système (spec 071). Une seule règle, appliquée à deux usages :
 * - `resolveRecipients` : liste des comptes, au début de la période (notification) ;
 * - `isInAudience` : une personne, à l'affichage (bandeau, détail, reçus).
 *
 * Règle : la personne a un rôle dans l'église du message (ou dans une église, pour un message
 * d'instance), ET un rôle de la liste si des rôles sont choisis, ET un lien avec un des
 * ministères ou départements choisis s'il y en a :
 * - responsable : responsable du département (`user_departments`) ou Ministre du ministère ;
 * - membre (sauf « responsables seulement ») : fiche STAR liée à son compte et rattachée au
 *   département ou à un département du ministère.
 */

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

/** Ce qu'on sait d'une personne dans une église. */
export interface ChurchFacts {
  roles: Set<Role>;
  headDepartmentIds: Set<string>;
  headMinistryIds: Set<string>;
  memberDepartmentIds: Set<string>;
  memberMinistryIds: Set<string>;
}

function emptyFacts(): ChurchFacts {
  return {
    roles: new Set(),
    headDepartmentIds: new Set(),
    headMinistryIds: new Set(),
    memberDepartmentIds: new Set(),
    memberMinistryIds: new Set(),
  };
}

function hasOrgCriteria(audience: Audience): boolean {
  return audience.ministryIds.length > 0 || audience.departmentIds.length > 0;
}

/** Règle du public, pure : faits d'une personne dans l'église du message. */
export function matchesAudience(audience: Audience, facts: ChurchFacts | undefined): boolean {
  if (!facts || facts.roles.size === 0) return false;
  if (audience.roles.length > 0 && !audience.roles.some((r) => facts.roles.has(r))) return false;
  if (!hasOrgCriteria(audience)) return true;

  const inDept = (ids: Set<string>) => audience.departmentIds.some((d) => ids.has(d));
  const inMinistry = (ids: Set<string>) => audience.ministryIds.some((m) => ids.has(m));
  const isHead = inDept(facts.headDepartmentIds) || inMinistry(facts.headMinistryIds);
  if (isHead) return true;
  if (audience.headsOnly) return false;
  return inDept(facts.memberDepartmentIds) || inMinistry(facts.memberMinistryIds);
}

type FactsByUser = Map<string, ChurchFacts>;

function factsFor(map: FactsByUser, userId: string): ChurchFacts {
  let facts = map.get(userId);
  if (!facts) {
    facts = emptyFacts();
    map.set(userId, facts);
  }
  return facts;
}

/**
 * Faits par compte dans une église : rôles, responsabilités, appartenances. `userIds` limite la
 * lecture à certaines personnes (affichage) ; sans lui, toute l'église (notification).
 */
export async function loadChurchFacts(churchId: string, userIds?: string[]): Promise<FactsByUser> {
  const prisma = await db();
  const userFilter = userIds ? { userId: { in: userIds } } : {};
  const [roles, links] = await Promise.all([
    prisma.userChurchRole.findMany({
      where: { churchId, ...userFilter },
      select: {
        userId: true,
        role: true,
        ministryId: true,
        departments: { select: { departmentId: true, department: { select: { ministryId: true } } } },
      },
    }),
    prisma.memberUserLink.findMany({
      where: { churchId, ...userFilter },
      select: {
        userId: true,
        member: {
          select: {
            departments: { select: { departmentId: true, department: { select: { ministryId: true } } } },
          },
        },
      },
    }),
  ]);

  const map: FactsByUser = new Map();
  for (const row of roles) {
    const facts = factsFor(map, row.userId);
    facts.roles.add(row.role);
    if (row.role === "MINISTER" && row.ministryId) facts.headMinistryIds.add(row.ministryId);
    for (const d of row.departments) {
      facts.headDepartmentIds.add(d.departmentId);
    }
  }
  for (const link of links) {
    // Une fiche liée sans rôle dans l'église ne donne pas accès à Koinonia : pas de public.
    const facts = map.get(link.userId);
    if (!facts) continue;
    for (const d of link.member.departments) {
      facts.memberDepartmentIds.add(d.departmentId);
      facts.memberMinistryIds.add(d.department.ministryId);
    }
  }
  return map;
}

export interface AudienceTarget {
  /** `null` : message pour toute l'instance. */
  churchId: string | null;
  audience: Audience;
}

/** Comptes visés par un message, dédoublonnés. */
export async function resolveRecipients(target: AudienceTarget): Promise<string[]> {
  if (target.churchId === null) {
    // Instance : seul le critère de rôle a un sens (les ministères appartiennent à une église).
    const prisma = await db();
    const rows = await prisma.userChurchRole.findMany({
      where: target.audience.roles.length > 0 ? { role: { in: target.audience.roles } } : {},
      select: { userId: true },
      distinct: ["userId"],
    });
    return rows.map((r) => r.userId);
  }
  const facts = await loadChurchFacts(target.churchId);
  return [...facts.entries()].filter(([, f]) => matchesAudience(target.audience, f)).map(([userId]) => userId);
}

/** Décompte pour l'aperçu : comptes visés, et fiches STAR concernées sans compte lié. */
export async function countAudience(
  target: AudienceTarget
): Promise<{ recipients: number; membersWithoutAccount: number }> {
  const recipients = (await resolveRecipients(target)).length;
  const { audience, churchId } = target;
  const includesMembers = !audience.headsOnly && (audience.roles.length === 0 || audience.roles.includes("STAR"));
  if (churchId === null || !includesMembers) return { recipients, membersWithoutAccount: 0 };

  const prisma = await db();
  const departmentFilter = hasOrgCriteria(audience)
    ? {
        OR: [
          { departmentId: { in: audience.departmentIds } },
          { department: { ministryId: { in: audience.ministryIds } } },
        ],
      }
    : { department: { ministry: { churchId } } };
  const membersWithoutAccount = await prisma.member.count({
    where: {
      departments: { some: { ...departmentFilter, department: { ministry: { churchId } } } },
      userLinks: { none: { churchId } },
    },
  });
  return { recipients, membersWithoutAccount };
}

/** Faits d'une personne, par église, pour l'affichage (bandeau, détail, reçus). */
export async function loadViewerFacts(userId: string, churchIds: string[]): Promise<Map<string, ChurchFacts>> {
  const entries = await Promise.all(
    churchIds.map(async (churchId) => [churchId, (await loadChurchFacts(churchId, [userId])).get(userId)] as const)
  );
  const result = new Map<string, ChurchFacts>();
  for (const [churchId, facts] of entries) if (facts) result.set(churchId, facts);
  return result;
}

/**
 * La personne fait-elle partie du public ? Pour un message d'instance, il suffit qu'une de ses
 * églises satisfasse le critère de rôle.
 */
export function isInAudience(target: AudienceTarget, viewerFacts: Map<string, ChurchFacts>): boolean {
  if (target.churchId === null) {
    return [...viewerFacts.values()].some((facts) =>
      matchesAudience({ ...target.audience, ministryIds: [], departmentIds: [] }, facts)
    );
  }
  return matchesAudience(target.audience, viewerFacts.get(target.churchId));
}
