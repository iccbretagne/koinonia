import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { pendingActionSchema } from "@/modules/assistant/schemas";

export const contract = defineContract({
  PATCH: {
    summary: "Traiter une question posée à l'assistant",
    description:
      "`answer` crée une fiche qui y répond, `link` la rattache comme formulation d'une fiche existante, `offtopic` la classe hors sujet. La réponse sert dès la question suivante. Journalisé.",
    access: "superAdmin",
    params: z.object({ id: z.string() }),
    body: pendingActionSchema,
    response: "Question traitée",
  },
  DELETE: {
    summary: "Supprimer une question posée à l'assistant",
    description: "Par exemple quand l'anonymisation a laissé passer un prénom. Journalisé.",
    access: "superAdmin",
    params: z.object({ id: z.string() }),
    response: "{ ok: true }",
  },
});
