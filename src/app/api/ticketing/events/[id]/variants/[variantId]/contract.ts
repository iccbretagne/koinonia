import { defineContract } from "@/lib/openapi/contract";
import { variantSchema } from "@/modules/ticketing/schemas";

export { variantSchema };

export const contract = defineContract({
  PATCH: {
    summary: "Modification d'un plat",
    description:
      "Libellé, description, allergènes, stock (jamais sous les quantités réservées et vendues), préparés, fermeture aux nouvelles commandes. Tout champ hors du menu (prix, règles) est refusé. Journalisé avec l'avant/après.",
    access: "session",
    accessNote: "restauration ou organisateur de l'événement",
    body: variantSchema,
    response: "Plat mis à jour",
  },
  DELETE: {
    summary: "Suppression d'un plat",
    description: "Possible seulement si le plat n'a jamais été réservé ni vendu ; sinon 409 (le fermer). Journalisée.",
    access: "session",
    accessNote: "restauration ou organisateur de l'événement",
    response: "`{ ok: true }`",
  },
});
