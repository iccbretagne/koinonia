import { defineContract } from "@/lib/openapi/contract";
import { pendingQuerySchema } from "@/modules/assistant/schemas";

export const contract = defineContract({
  GET: {
    summary: "Questions posées à l'assistant qui attendent une réponse",
    description: "Texte anonymisé, regroupé, avec le nombre de fois, l'écran et le rôle — jamais le compte ni l'église.",
    access: "superAdmin",
    query: pendingQuerySchema,
    response: "Questions",
  },
});
