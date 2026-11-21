import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const decisionSchema = z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().trim().max(300).optional() }).strict();

export const contract = defineContract({
  PATCH: {
    summary: "Approbation ou refus d'un domaine dédié",
    description: "Approuver exige un DNS vérifié ; le domaine est alors servi (cache du proxy rafraîchi en une minute). Refuser supprime la demande, avec un motif facultatif transmis à l'organisateur. Journalisé.",
    access: "superAdmin",
    body: decisionSchema,
    response: "Rien",
  },
});
