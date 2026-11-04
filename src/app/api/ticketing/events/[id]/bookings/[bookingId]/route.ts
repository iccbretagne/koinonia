import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { cancelByOrganizer, getBookingView, notifyContact } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";
import { organizerBookingPatchSchema } from "./contract";

type Params = { params: Promise<{ id: string; bookingId: string }> };

async function viewInEvent(eventId: string, bookingId: string) {
  const view = await getBookingView(bookingId);
  if (view.event.id !== eventId) throw new ApiError(404, "Réservation introuvable");
  return view;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, bookingId } = await params;
    await requireEventAction(id, "payments");
    return successResponse(await viewInEvent(id, bookingId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, bookingId } = await params;
    await requireEventAction(id, "payments");
    await viewInEvent(id, bookingId);
    const data = organizerBookingPatchSchema.parse(await request.json());
    if (data.action === "remind") {
      await notifyContact(bookingId, "TICKETING_REMINDER", { updated: "Voici le récapitulatif de votre réservation." });
      return successResponse({ message: "Récapitulatif renvoyé." });
    }
    const result = await cancelByOrganizer(bookingId, data.action === "cancelParticipant" ? data.participantId : null);
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
