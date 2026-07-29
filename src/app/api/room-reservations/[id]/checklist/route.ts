import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { declareOpening, declareClosing } from "@/modules/rooms";
import { z } from "zod";

const bodySchema = z.discriminatedUnion("phase", [
  z.object({
    phase: z.literal("open"),
    keyReceivedFromId: z.string().min(1).optional(),
    keyReceivedFromName: z.string().min(1).max(200).optional(),
    notes: z.string().max(500).optional(),
  }),
  z.object({
    phase: z.literal("close"),
    closedProperly: z.boolean(),
    cleaned: z.boolean(),
    equipmentOk: z.boolean(),
    equipmentNotes: z.string().max(500).optional(),
    keyReturnedToId: z.string().min(1).optional(),
    keyReturnedToName: z.string().min(1).max(200).optional(),
    notes: z.string().max(500).optional(),
  }),
]);

/**
 * PATCH /api/room-reservations/[id]/checklist — déclare l'ouverture ou la fermeture.
 * Réservé au créateur de la réservation (ownership).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await requireAuth();
    const data = bodySchema.parse(await request.json());

    if (data.phase === "open") {
      const checklist = await declareOpening({
        reservationId: id,
        userId: session.user.id,
        keyReceivedFromId: data.keyReceivedFromId,
        keyReceivedFromName: data.keyReceivedFromName,
        notes: data.notes,
      });
      return successResponse(checklist);
    }

    const checklist = await declareClosing({
      reservationId: id,
      userId: session.user.id,
      closedProperly: data.closedProperly,
      cleaned: data.cleaned,
      equipmentOk: data.equipmentOk,
      equipmentNotes: data.equipmentNotes,
      keyReturnedToId: data.keyReturnedToId,
      keyReturnedToName: data.keyReturnedToName,
      notes: data.notes,
    });
    return successResponse(checklist);
  } catch (error) {
    return errorResponse(error);
  }
}

