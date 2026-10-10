import { requireChurchPermission, resolveChurchId, requireDepartmentAccess } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { deleteTeamEvent, getTeamEventScopeInfo, updateTeamEvent } from "@/modules/planning";
import { updateSchema } from "./contract";

/**
 * L'événement est désigné par son id : le département visé vient de l'événement lui-même
 * (jamais d'un `departmentId` fourni par le client) avant d'appliquer la garde de périmètre.
 */
async function requireTeamEventAccess(teamEventId: string) {
  const churchId = await resolveChurchId("teamEvent", teamEventId);
  const session = await requireChurchPermission("planning:edit", churchId);

  const scopeInfo = await getTeamEventScopeInfo(teamEventId);
  if (!scopeInfo) throw new ApiError(404, "Événement d'équipe introuvable");

  requireDepartmentAccess(session, churchId, scopeInfo.departmentId);

  return { session, churchId, scopeInfo };
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ teamEventId: string }> }
) {
  try {
    const { teamEventId } = await params;
    const { session, churchId } = await requireTeamEventAccess(teamEventId);

    const body = updateSchema.parse(await request.json());

    const { updated } = await updateTeamEvent(
      teamEventId,
      {
        title: body.title,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        location: body.location ?? null,
        description: body.description ?? null,
      },
      body.scope
    );

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "UPDATE",
      entityType: "TeamEvent",
      entityId: teamEventId,
      details: { scope: body.scope, updated },
    });

    return successResponse({ updated });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ teamEventId: string }> }
) {
  try {
    const { teamEventId } = await params;
    const { session, churchId } = await requireTeamEventAccess(teamEventId);

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") === "following" ? "following" : "occurrence";

    const { deleted } = await deleteTeamEvent(teamEventId, scope);

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "DELETE",
      entityType: "TeamEvent",
      entityId: teamEventId,
      details: { scope, deleted },
    });

    return successResponse({ deleted });
  } catch (error) {
    return errorResponse(error);
  }
}
