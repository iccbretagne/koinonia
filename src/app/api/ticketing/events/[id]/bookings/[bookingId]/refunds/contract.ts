import { defineContract } from "@/lib/openapi/contract";
import { refundSchema } from "@/modules/ticketing/schemas";

export { refundSchema };

export const contract = defineContract({
  POST: {
    summary: "Remboursement d'éléments « à rembourser »",
    description: "Les éléments choisis à l'état « à rembourser » passent à remboursé, avec le moyen et la date (409 si aucun).",
    access: "session",
    accessNote: "organisateur ou trésorier de l'événement",
    body: refundSchema,
    status: 201,
    response: "Remboursement enregistré",
  },
});
