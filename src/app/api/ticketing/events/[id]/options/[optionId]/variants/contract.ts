import { defineContract } from "@/lib/openapi/contract";
import { variantCreateSchema } from "@/modules/ticketing/schemas";

export { variantCreateSchema };

export const contract = defineContract({
  POST: {
    summary: "Ajout d'un plat au menu d'une option",
    description:
      "Plat (variante) d'une option à choix : libellé, description, allergènes, stock. Composé par la restauration ou l'organisateur ; le prix et les règles de l'option restent à l'organisateur. Journalisé.",
    access: "session",
    accessNote: "restauration ou organisateur de l'événement",
    body: variantCreateSchema,
    status: 201,
    response: "Plat créé",
  },
});
