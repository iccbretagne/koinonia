import { defineContract } from "@/lib/openapi/contract";
import { optionCreateSchema } from "@/modules/ticketing/schemas";

export { optionCreateSchema };

export const contract = defineContract({
  POST: {
    summary: "Ajout d'une option à un événement",
    description:
      "Repas, t-shirt, navette… : type (choix unique, quantité, case à cocher), portée (participant ou réservation), prix, stock, « à retirer sur place », préparation nominative, remboursement et sa date limite. Variantes initiales facultatives (la restauration compose le menu ensuite). Journalisée.",
    access: "session",
    accessNote: "organisateur de l'événement",
    body: optionCreateSchema,
    status: 201,
    response: "Option créée",
  },
});
