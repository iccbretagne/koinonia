import type { Session } from "next-auth";
import type { z } from "zod";
import { getUserDepartmentScope } from "@/lib/auth";
import { ApiError } from "@/lib/api-utils";
import { getMemberScope, listLinkedMemberIds, saveResponses } from "@/modules/planning";
import type { putSchema } from "./contract";

/**
 * Disponibilités d'un STAR (spec 058). Sans `memberId`, la fiche liée au compte appelant
 * (aucune permission requise) ; avec `memberId` d'un tiers, « Répondre pour… » réservé à
 * `planning:edit` et borné au périmètre départemental de l'appelant.
 */
export async function resolveAvailabilityTarget(
  session: Session,
  churchId: string,
  memberId: string | null,
  requirePermission: (permission: string) => Promise<unknown>
) {
  const ownIds = await listLinkedMemberIds(session.user.id, churchId);

  if (!memberId || ownIds.includes(memberId)) {
    const own = memberId ?? ownIds[0];
    if (!own) throw new ApiError(404, "Aucune fiche STAR liée à votre compte");
    return { session, memberId: own, isSelf: true, allowedDepartmentIds: null as string[] | null };
  }

  await requirePermission("planning:edit");
  const scope = await getMemberScope(memberId);
  if (scope?.churchId !== churchId) throw new ApiError(404, "Fiche STAR introuvable");
  const deptScope = getUserDepartmentScope(session, churchId);
  if (!deptScope.scoped) return { session, memberId, isSelf: false, allowedDepartmentIds: null };
  const allowed = scope.departmentIds.filter((d) => deptScope.departmentIds.includes(d));
  if (allowed.length === 0) throw new ApiError(403, "Ce STAR est hors de votre périmètre");
  return { session, memberId, isSelf: false, allowedDepartmentIds: allowed };
}

/**
 * Enregistre des réponses de disponibilité, pour soi ou « Répondre pour… » un STAR de son
 * périmètre (même code pour l'écran et l'assistant IA — spec 081, lot 3b).
 */
export async function answerFor(
  session: Session,
  churchId: string,
  memberId: string | null,
  answers: z.infer<typeof putSchema>["answers"],
  requirePermission: (permission: string) => Promise<unknown>
) {
  const target = await resolveAvailabilityTarget(session, churchId, memberId, requirePermission);

  let scopedAnswers = answers;
  if (target.allowedDepartmentIds) {
    const allowed = target.allowedDepartmentIds;
    scopedAnswers = answers.map((a) => {
      const requested = a.departmentIds ?? allowed;
      const departmentIds = requested.filter((d) => allowed.includes(d));
      if (departmentIds.length === 0) throw new ApiError(403, "Département hors de votre périmètre");
      return { ...a, departmentIds };
    });
  }

  const result = await saveResponses({
    memberId: target.memberId,
    churchId,
    answers: scopedAnswers,
    actorId: session.user.id,
  });
  return result;
}
