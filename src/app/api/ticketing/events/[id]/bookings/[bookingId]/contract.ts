import { defineContract } from "@/lib/openapi/contract";
import { organizerBookingPatchSchema } from "@/modules/ticketing/schemas";

export { organizerBookingPatchSchema };

export const contract = defineContract({
  GET: {
    summary: "Détail d'une réservation (équipe)",
    description: "Même contenu que « Ma réservation », pour l'organisateur et le trésorier.",
    access: "session",
    accessNote: "organisateur ou trésorier de l'événement",
    response: "Réservation",
  },
  PATCH: {
    summary: "Annulation ou relance d'une réservation par l'organisation",
    description:
      "`cancelParticipant`, `cancelBooking` : places et stock rendus, remboursement selon les règles de chaque élément, contact prévenu, restauration prévenue si une option à retirer est touchée. `remind` : renvoie le récapitulatif et les instructions de paiement.",
    access: "session",
    accessNote: "organisateur ou trésorier de l'événement",
    body: organizerBookingPatchSchema,
    response: "Résultat",
  },
});
