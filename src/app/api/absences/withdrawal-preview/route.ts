import { successResponse, errorResponse } from "@/lib/api-utils";
import { findWithdrawableServicesForAbsence } from "@/modules/planning";
import { requireAbsenceSubjectAccess } from "../_shared/subject-access";
import { querySchema } from "./contract";

/**
 * GET /api/absences/withdrawal-preview?churchId=&memberId=&startDate=&endDate=&allDepartments=&departmentIds=
 *
 * Services que la période désisterait si elle était enregistrée (spec 062) : planifiés, couverts,
 * avant leur date limite, sans désistement déjà en attente — pour l'avertissement du formulaire.
 * Indicatif : l'enregistrement recalcule. Mêmes gardes que `target-options`.
 */
export async function GET(request: Request) {
  try {
    const { churchId, memberId } = await requireAbsenceSubjectAccess(request);
    const q = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const allDepartments = q.allDepartments === "true";

    const services = await findWithdrawableServicesForAbsence(undefined, {
      memberId,
      churchId,
      targeting: {
        kind: "PERIOD",
        startDate: new Date(q.startDate),
        endDate: new Date(q.endDate),
        allDepartments,
        departmentIds: allDepartments ? [] : (q.departmentIds ?? "").split(",").filter(Boolean),
      },
    });
    return successResponse({ services });
  } catch (error) {
    return errorResponse(error);
  }
}
