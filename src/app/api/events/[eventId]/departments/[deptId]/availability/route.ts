import { requireChurchPermission, resolveChurchId, requireDepartmentAccess } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { askTeam, assertEventDepartment, manualRelance } from "@/modules/planning";
import { schema } from "./contract";

/** « Interroger l'équipe » / « Relancer les sans-réponse » depuis la grille (spec 058). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string; deptId: string }> }
) {
  try {
    const { eventId, deptId: departmentId } = await params;
    const churchId = await resolveChurchId("event", eventId);
    const session = await requireChurchPermission("planning:edit", churchId);
    requireDepartmentAccess(session, churchId, departmentId);
    await assertEventDepartment(eventId, departmentId);
    const { action } = schema.parse(await request.json());

    const result =
      action === "ask"
        ? await askTeam({ eventId, departmentId, actorId: session.user.id })
        : await manualRelance({ eventId, departmentId });
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
