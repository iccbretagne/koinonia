import { requireChurchPermission, resolveChurchId, requireDepartmentAccess } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { assignEventTasks, listEventTasks } from "@/modules/planning";
import { assignSchema } from "./contract";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string; deptId: string }> }
) {
  try {
    const { eventId, deptId: departmentId } = await params;
    const churchId = await resolveChurchId("event", eventId);
    const session = await requireChurchPermission("planning:department", churchId);
    requireDepartmentAccess(session, churchId, departmentId);

    return successResponse(await listEventTasks(eventId, departmentId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ eventId: string; deptId: string }> }
) {
  try {
    const { eventId, deptId: departmentId } = await params;
    const putChurchId = await resolveChurchId("event", eventId);
    const putSession = await requireChurchPermission("planning:edit", putChurchId);
    requireDepartmentAccess(putSession, putChurchId, departmentId);
    const body = await request.json();
    const { taskId, memberIds } = assignSchema.parse(body);

    const [updatedTask] = await assignEventTasks(eventId, departmentId, [{ taskId, memberIds }]);

    await logAudit({ userId: putSession.user.id, churchId: putChurchId, action: "UPDATE", entityType: "TaskAssignment", entityId: taskId, details: { eventId, departmentId, memberIds } });

    return successResponse(updatedTask ?? null);
  } catch (error) {
    return errorResponse(error);
  }
}
