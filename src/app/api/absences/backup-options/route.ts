import { successResponse, errorResponse } from "@/lib/api-utils";
import { resolveSubjectUserId, listBackupOptions } from "@/modules/planning";
import { requireAbsenceSubjectAccess } from "../_shared/subject-access";

/**
 * GET /api/absences/backup-options?churchId=&memberId=
 *
 * Liste les backups possibles pour l'absence du STAR `memberId` — utilisé quand un manager
 * (Super Admin/Admin/Secrétaire/Ministre/Resp. département) déclare ou modifie une absence pour
 * un tiers et doit savoir si ce tiers est lui-même Resp. département/Ministre (auquel cas un
 * backup peut être proposé, dans le périmètre de ce tiers).
 *
 * Ne fait qu'informer l'affichage : la validation d'écriture reste faite par
 * `validateBackupTargets` sur `POST`/`PATCH`.
 */
export async function GET(request: Request) {
  try {
    const { churchId, memberId } = await requireAbsenceSubjectAccess(request);

    const subjectUserId = await resolveSubjectUserId(memberId, churchId);
    if (!subjectUserId) return successResponse({ eligible: false, options: [] });

    const result = await listBackupOptions(subjectUserId, churchId);
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
