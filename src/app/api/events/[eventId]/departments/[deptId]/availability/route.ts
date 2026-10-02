import { requireChurchPermission, resolveChurchId, requireDepartmentAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { askTeam, manualRelance } from "@/modules/planning";
import { z } from "zod";

const schema = z.object({ action: z.enum(["ask", "relance"]) });

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
    const linked = await prisma.eventDepartment.findUnique({
      where: { eventId_departmentId: { eventId, departmentId } },
      select: { id: true },
    });
    if (!linked) throw new ApiError(404, "Ce département ne participe pas à cet événement");
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
