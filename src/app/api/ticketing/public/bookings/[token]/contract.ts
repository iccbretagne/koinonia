import { defineContract } from "@/lib/openapi/contract";
import { bookingPatchSchema } from "@/modules/ticketing/schemas";

export { bookingPatchSchema };

export const contract = defineContract({
  GET: {
    summary: "Ma réservation (lien personnel)",
    description:
      "Jeton de gestion dans l'adresse (seule son empreinte est stockée) ; jeton inconnu → 404, toujours le même message. Récapitulatif, éléments et états de paiement, billets, code de réservation, instructions de paiement, gestes possibles.",
    access: "token",
    response: "Réservation",
  },
  PATCH: {
    summary: "Modification de ma réservation",
    description:
      "`updateOptions` jusqu'à la date limite de paiement des options et dans la limite du stock (un changement de plat garde le prix ; une option retirée suit les règles de remboursement) ; `addParticipant` si l'inscription est ouverte ; `renameParticipant` jusqu'au début ; `updatePhone` ; `cancelParticipant` et `cancelBooking` (places et stock rendus, remboursement selon les règles). Email récapitulatif à chaque modification. 30 demandes par minute et par IP.",
    access: "token",
    body: bookingPatchSchema,
    response: "`{ message }`",
  },
});
