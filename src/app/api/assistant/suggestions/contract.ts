import { defineContract } from "@/lib/openapi/contract";
import { suggestionsQuerySchema } from "@/modules/assistant/schemas";

export const contract = defineContract({
  GET: {
    summary: "Questions fréquentes de l'écran courant",
    description: "Trois questions au plus, propres à l'écran (`screen`) et au rôle, complétées par des questions générales.",
    access: "session",
    accessNote: "église courante, assistant actif",
    query: suggestionsQuerySchema,
    response: "Questions proposées",
  },
});
