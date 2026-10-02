import { requireAuth, requireChurchPermission, getUserDepartmentScope } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { getMemberScope, listLinkedMemberIds, listMemberAvailability, saveResponses } from "@/modules/planning";
import { z } from "zod";

/**
 * Disponibilités d'un STAR (spec 058). Sans `memberId`, la fiche liée au compte appelant
 * (aucune permission requise) ; avec `memberId` d'un tiers, « Répondre pour… » réservé à
 * `planning:edit` et borné au périmètre départemental de l'appelant.
 */
async function resolveTarget(churchId: string, memberId: string | null) {
  const session = await requireAuth();
  const ownIds = await listLinkedMemberIds(session.user.id, churchId);

  if (!memberId || ownIds.includes(memberId)) {
    const own = memberId ?? ownIds[0];
    if (!own) throw new ApiError(404, "Aucune fiche STAR liée à votre compte");
    return { session, memberId: own, isSelf: true, allowedDepartmentIds: null as string[] | null };
  }

  await requireChurchPermission("planning:edit", churchId);
  const scope = await getMemberScope(memberId);
  if (!scope || scope.churchId !== churchId) throw new ApiError(404, "Fiche STAR introuvable");
  const deptScope = getUserDepartmentScope(session, churchId);
  if (!deptScope.scoped) return { session, memberId, isSelf: false, allowedDepartmentIds: null };
  const allowed = scope.departmentIds.filter((d) => deptScope.departmentIds.includes(d));
  if (allowed.length === 0) throw new ApiError(403, "Ce STAR est hors de votre périmètre");
  return { session, memberId, isSelf: false, allowedDepartmentIds: allowed };
}

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");
    const monthParam = searchParams.get("month");
    const month = monthParam
      ? new Date(`${monthSchema.parse(monthParam)}-01T00:00:00.000Z`)
      : new Date();

    const target = await resolveTarget(churchId, searchParams.get("memberId"));
    const data = await listMemberAvailability(target.memberId, churchId, month);
    return successResponse({ memberId: target.memberId, isSelf: target.isSelf, ...data });
  } catch (error) {
    return errorResponse(error);
  }
}

const putSchema = z.object({
  churchId: z.string().min(1),
  memberId: z.string().min(1).optional(),
  answers: z
    .array(
      z.object({
        eventId: z.string().min(1),
        answer: z.enum(["AVAILABLE", "IF_NEEDED", "UNAVAILABLE"]),
        departmentIds: z.array(z.string().min(1)).min(1).optional(),
      })
    )
    .min(1)
    .max(200),
});

export async function PUT(request: Request) {
  try {
    const { churchId, memberId, answers } = putSchema.parse(await request.json());
    const target = await resolveTarget(churchId, memberId ?? null);

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
      actorId: target.session.user.id,
    });
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
