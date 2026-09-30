import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { DEPT_FN } from "@/lib/department-functions";
import { getFunctionDepartmentIds } from "@/lib/function-departments";
import type { CareCompanionMode } from "@/generated/prisma/client";

/**
 * Accompagnants STAR du suivi pastoral (spec 056) : le vivier reste **calculé** à partir de
 * l'appartenance au MSDP (par fiche STAR ou par responsabilité — même vivier que #616), avec des
 * **exceptions déclarées** par église dans `CareCompanion` :
 *   - `ADDED` : STAR ajouté nominativement (hors MSDP, ou gardé après son départ du MSDP) ;
 *   - `EXCLUDED` : membre du MSDP écarté par le référent.
 *
 * Sans exception enregistrée, la règle donne exactement le vivier d'avant cette feature —
 * aucune reprise de données au déploiement. La liste proposée (`listEligibleCompanions`) et la
 * vérification à l'affectation (`isEligibleCompanion`, appelée par `resolveAssignee`) appliquent
 * la même règle : l'écart corrigé par #616 (liste et vérification divergentes) ne peut plus se
 * reproduire.
 */

export interface CompanionCandidate {
  id: string;
  name: string | null;
  email: string | null;
  departments: { id: string; name: string }[];
  isMsdp: boolean;
  exception: CareCompanionMode | null;
}

/** Un candidat est un STAR de l'église ayant un compte lié et validé (même critère qu'avant). */
export async function listCompanionCandidates(churchId: string): Promise<CompanionCandidate[]> {
  const msdpDeptIds = await getFunctionDepartmentIds(churchId, DEPT_FN.MSDP);

  const [links, msdpDeptHeads, exceptions] = await Promise.all([
    prisma.memberUserLink.findMany({
      where: { churchId, validatedAt: { not: null } },
      select: {
        user: { select: { id: true, name: true, email: true } },
        member: {
          select: {
            departments: { select: { department: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
    prisma.userChurchRole.findMany({
      where: { churchId, departments: { some: { departmentId: { in: msdpDeptIds } } } },
      select: { userId: true },
    }),
    prisma.careCompanion.findMany({
      where: { churchId },
      select: { userId: true, mode: true },
    }),
  ]);

  const msdpDeptHeadIds = new Set(msdpDeptHeads.map((r) => r.userId));
  const exceptionByUserId = new Map(exceptions.map((e) => [e.userId, e.mode]));

  return links.map(({ user, member }) => {
    const departments = member.departments.map((d) => d.department);
    const isMsdp =
      departments.some((d) => msdpDeptIds.includes(d.id)) || msdpDeptHeadIds.has(user.id);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      departments,
      isMsdp,
      exception: exceptionByUserId.get(user.id) ?? null,
    };
  });
}

/** Règle d'éligibilité (spec 056) — pure, sans accès base. */
export function isCompanionEligible(candidate: Pick<CompanionCandidate, "isMsdp" | "exception">): boolean {
  if (candidate.exception === "ADDED") return true;
  if (candidate.exception === "EXCLUDED") return false;
  return candidate.isMsdp;
}

/** Vivier proposé pour `GET /api/care/companions` — remplace `listMsdpCounselors`. */
export async function listEligibleCompanions(
  churchId: string
): Promise<{ id: string; name: string | null; email: string | null }[]> {
  const candidates = await listCompanionCandidates(churchId);
  return candidates
    .filter(isCompanionEligible)
    .map(({ id, name, email }) => ({ id, name, email }))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

/** Même règle pour un seul utilisateur — utilisée par `resolveAssignee`. */
export async function isEligibleCompanion(churchId: string, userId: string): Promise<boolean> {
  const candidates = await listCompanionCandidates(churchId);
  const candidate = candidates.find((c) => c.id === userId);
  return !!candidate && isCompanionEligible(candidate);
}

interface CompanionWithLoad extends CompanionCandidate {
  activeAssignments: number;
}

async function countActiveAssignments(churchId: string): Promise<Map<string, number>> {
  const [appointments, followups] = await Promise.all([
    prisma.appointmentRequest.groupBy({
      by: ["assignedMemberId"],
      where: {
        churchId,
        status: { in: ["VALIDATED", "SCHEDULED"] },
        assignedMemberId: { not: null },
      },
      _count: { _all: true },
    }),
    prisma.msdpFollowUp.groupBy({
      by: ["assignedConseillerMsdpId"],
      where: {
        churchId,
        status: { in: ["ASSIGNED", "CONTACTED", "IN_FORMATION"] },
        assignedConseillerMsdpId: { not: null },
      },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map<string, number>();
  for (const row of appointments) {
    if (!row.assignedMemberId) continue;
    counts.set(row.assignedMemberId, (counts.get(row.assignedMemberId) ?? 0) + row._count._all);
  }
  for (const row of followups) {
    if (!row.assignedConseillerMsdpId) continue;
    counts.set(
      row.assignedConseillerMsdpId,
      (counts.get(row.assignedConseillerMsdpId) ?? 0) + row._count._all
    );
  }
  return counts;
}

/** Contenu de la carte « Accompagnants » des paramètres du suivi pastoral. */
export async function getCompanionSettings(churchId: string): Promise<{
  msdp: CompanionWithLoad[];
  added: CompanionWithLoad[];
  candidates: CompanionWithLoad[];
}> {
  const [candidates, loads] = await Promise.all([
    listCompanionCandidates(churchId),
    countActiveAssignments(churchId),
  ]);

  const withLoad: CompanionWithLoad[] = candidates
    .map((c) => ({ ...c, activeAssignments: loads.get(c.id) ?? 0 }))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  return {
    msdp: withLoad.filter((c) => c.isMsdp),
    added: withLoad.filter((c) => !c.isMsdp && c.exception === "ADDED"),
    candidates: withLoad.filter((c) => !c.isMsdp && c.exception !== "ADDED"),
  };
}

export type CompanionState = "ADDED" | "EXCLUDED" | "DEFAULT";

/** Déclare une exception (ou revient au calcul par défaut) pour un candidat donné. */
export async function setCompanionState(params: {
  churchId: string;
  userId: string;
  state: CompanionState;
  actorId: string;
}): Promise<{ userId: string; state: CompanionState; activeAssignments: number }> {
  const { churchId, userId, state, actorId } = params;

  const candidates = await listCompanionCandidates(churchId);
  const candidate = candidates.find((c) => c.id === userId);
  if (!candidate) {
    throw new ApiError(400, "Cette personne n'a pas de compte STAR lié et validé dans cette église");
  }
  if (state === "ADDED" && candidate.isMsdp) {
    throw new ApiError(400, "Ce STAR appartient déjà au MSDP : rien à ajouter");
  }
  if (state === "EXCLUDED" && !candidate.isMsdp) {
    throw new ApiError(400, "Seul un membre du MSDP peut être exclu");
  }

  const previousMode = candidate.exception;
  const nextMode: CareCompanionMode | null = state === "DEFAULT" ? null : state;

  if (previousMode !== nextMode) {
    if (nextMode === null) {
      await prisma.careCompanion.deleteMany({ where: { churchId, userId } });
    } else {
      await prisma.careCompanion.upsert({
        where: { churchId_userId: { churchId, userId } },
        create: { churchId, userId, mode: nextMode, createdById: actorId },
        update: { mode: nextMode, createdById: actorId },
      });
    }
    await logAudit({
      userId: actorId,
      churchId,
      action: "UPDATE",
      entityType: "CareCompanion",
      entityId: userId,
      details: { from: previousMode, to: nextMode },
    });
  }

  const loads = await countActiveAssignments(churchId);
  return { userId, state, activeAssignments: loads.get(userId) ?? 0 };
}
