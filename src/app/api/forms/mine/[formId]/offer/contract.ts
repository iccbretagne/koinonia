import { defineContract } from "@/lib/openapi/contract";
import { offerSchema } from "@/modules/forms/schemas";

export { offerSchema };

export const contract = defineContract({
  POST: {
    summary: "Réponse à une place proposée",
    description:
      "Liste d'attente : accepter confirme la réponse ; décliner la clôt et propose la place à la personne suivante. Aucune place proposée ou proposition expirée : 409.",
    access: "session",
    accessNote: "sa propre réponse seulement",
    body: offerSchema,
    response: "Nouvel état de la réponse",
  },
});
