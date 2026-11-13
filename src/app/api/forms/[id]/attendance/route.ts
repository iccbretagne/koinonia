import { successResponse, errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireFormAccess, scopeWhere } from "@/modules/forms/auth";
import { getAttendanceSheet, saveAttendance } from "@/modules/forms";
import { readJson } from "../../_shared";
import { attendanceQuerySchema, attendanceSchema } from "./contract";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await requireFormAccess(id);
    const { sessionId } = attendanceQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return successResponse(await getAttendanceSheet(id, sessionId, scopeWhere(access)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await requireFormAccess(id);
    const { sessionId, cells } = attendanceSchema.parse(await readJson(request));
    const changed = await saveAttendance(id, sessionId, cells, scopeWhere(access), access.session.user.id);
    for (const cell of changed) {
      await logAudit({
        userId: access.session.user.id,
        churchId: access.churchId,
        action: "UPDATE",
        entityType: "FormAttendance",
        entityId: cell.responseId,
        details: { formId: id, sessionId, day: cell.day, half: cell.half, present: cell.present },
      });
    }
    return successResponse({ changed: changed.length });
  } catch (error) {
    return errorResponse(error);
  }
}
