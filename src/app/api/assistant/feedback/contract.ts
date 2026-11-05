import { defineContract } from "@/lib/openapi/contract";
import { feedbackSchema } from "@/modules/assistant/schemas";

export const contract = defineContract({
  POST: {
    summary: "Avis « Utile » / « Pas utile » sur une réponse",
    description: "Compté sans compte ni église. « Pas utile » remonte la question au Super Admin, anonymisée.",
    access: "session",
    accessNote: "église courante, assistant actif",
    body: feedbackSchema,
    response: "{ ok: true }",
  },
});
