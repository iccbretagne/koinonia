import { prisma } from "@/lib/prisma";
import { requireAuth, getUserDepartmentScope } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import {
  validateChecklist,
  reportIssueWithoutDeclaration,
  closeWithoutDeclaration,
  isControlTeamMember,
} from "@/modules/rooms";
import { z } from "zod";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("validate"),
    validatedClosedProperly: z.boolean(),
    validatedCleaned: z.boolean(),
    validatedEquipmentOk: z.boolean(),
    incidentNotes: z.string().max(1000).optional(),
  }),
  z.object({
    action: z.literal("report-issue"),
    incidentNotes: z.string().min(1).max(1000),
  }),
  z.object({
    action: z.literal("close-manually"),
    notes: z.string().max(1000).optional(),
  }),
]);

/**
 * PATCH /api/room-reservations/[id]/checklist/validate — contrôle une main courante (fermeture
 * déclarée), ou traite une réservation passée jamais déclarée (signalement d'écart ou clôture
 * manuelle). Réservé à l'équipe dédiée (fonction de département SECURITE/ENTRETIEN) ou
 * `rooms:manage`.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const reservation = await prisma.roomReservation.findUnique({ where: { id }, select: { churchId: true } });
    if (!reservation) throw new ApiError(404, "Réservation introuvable");

    const session = await requireAuth();
    let authorized = session.user.isSuperAdmin;

    if (!authorized) {
      const { rolePermissions } = await import("@/lib/registry");
      const roles = session.user.churchRoles.filter((r) => r.churchId === reservation.churchId);
      const perms = new Set(roles.flatMap((r) => rolePermissions[r.role] ?? []));
      authorized = perms.has("rooms:manage");
    }

    if (!authorized) {
      const deptScope = getUserDepartmentScope(session, reservation.churchId);
      if (deptScope.scoped) {
        authorized = await isControlTeamMember(deptScope.departmentIds);
      }
    }

    if (!authorized) {
      throw new ApiError(403, "Réservé à l'équipe de contrôle (Sécurité/Entretien) ou à la gestion des salles");
    }

    const data = bodySchema.parse(await request.json());

    if (data.action === "validate") {
      const checklist = await validateChecklist({
        reservationId: id,
        validatorId: session.user.id,
        validatedClosedProperly: data.validatedClosedProperly,
        validatedCleaned: data.validatedCleaned,
        validatedEquipmentOk: data.validatedEquipmentOk,
        incidentNotes: data.incidentNotes,
      });
      return successResponse(checklist);
    }

    if (data.action === "report-issue") {
      const checklist = await reportIssueWithoutDeclaration({
        reservationId: id,
        validatorId: session.user.id,
        incidentNotes: data.incidentNotes,
      });
      return successResponse(checklist);
    }

    const checklist = await closeWithoutDeclaration({
      reservationId: id,
      validatorId: session.user.id,
      notes: data.notes,
    });
    return successResponse(checklist);
  } catch (error) {
    return errorResponse(error);
  }
}
