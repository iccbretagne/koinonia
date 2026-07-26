import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { cancelReservation } from "@/modules/rooms";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const patchSchema = z.object({
  action: z.literal("cancel"),
  scope: z.enum(["occurrence", "series"]),
});

/** PATCH /api/room-reservations/[id] — annule une occurrence ou une série. Créateur ou `rooms:manage`. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const reservation = await prisma.roomReservation.findUnique({ where: { id } });
    if (!reservation) throw new ApiError(404, "Réservation introuvable");

    const session = await requireAuth();
    const isOwner = reservation.createdById === session.user.id;

    if (!isOwner) {
      let authorized = session.user.isSuperAdmin;
      if (!authorized) {
        const { rolePermissions } = await import("@/lib/registry");
        const roles = session.user.churchRoles.filter((r) => r.churchId === reservation.churchId);
        const perms = new Set(roles.flatMap((r) => rolePermissions[r.role] ?? []));
        authorized = perms.has("rooms:manage");
      }
      if (!authorized) throw new ApiError(403, "Seul le créateur ou un gestionnaire de salles peut annuler");
    }

    const data = patchSchema.parse(await request.json());
    const result = await cancelReservation({
      id,
      churchId: reservation.churchId,
      cancelledById: session.user.id,
      scope: data.scope,
    });

    await logAudit({
      userId: session.user.id,
      churchId: reservation.churchId,
      action: "UPDATE",
      entityType: "RoomReservation",
      entityId: id,
      details: { action: "cancel", scope: data.scope, cancelledIds: result.cancelledIds },
    });

    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
