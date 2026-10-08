import { successResponse, errorResponse } from "@/lib/api-utils";
import { listTargetOptions } from "@/modules/planning";
import { requireAbsenceSubjectAccess } from "../_shared/subject-access";

/**
 * GET /api/absences/target-options?churchId=&memberId=
 *
 * Liste les départements et événements ciblables pour la déclaration/modification d'une absence
 * du STAR `memberId` (spec 050) : mêmes gardes que `backup-options` — soi-même, ou
 * `absences:manage` + périmètre départemental si le déclarant est restreint.
 */
export async function GET(request: Request) {
  try {
    const { churchId, memberId, declarerScope } = await requireAbsenceSubjectAccess(request);

    const result = await listTargetOptions(undefined, churchId, memberId, declarerScope);
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
