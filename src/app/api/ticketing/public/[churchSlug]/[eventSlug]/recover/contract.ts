import { defineContract } from "@/lib/openapi/contract";
import { recoverSchema } from "@/modules/ticketing/schemas";

export { recoverSchema };

export const contract = defineContract({
  POST: {
    summary: "Retrouver ma réservation",
    description:
      "Renvoie par email les liens « Ma réservation » des réservations actives de cet email pour l'événement. Réponse toujours identique, que l'email soit connu ou non. Turnstile obligatoire, 3 demandes par minute et par IP.",
    access: "public",
    body: recoverSchema,
    response: "`{ ok: true }`",
  },
});
