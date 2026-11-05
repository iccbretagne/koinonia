import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { reopenSchema } from "@/modules/treasury/schemas";

export const contract = defineContract({
  DELETE: {
    summary: "Réouverture d'un mois clôturé",
    description: "Réservée à l'Admin et au Super Admin. Motif obligatoire, conservé dans l'historique avec l'auteur et la date.",
    access: "treasury:reopen",
    accessNote: "dans l'église courante",
    params: z.object({ month: z.string() }),
    body: reopenSchema,
    response: "`{ reopened: true }`",
  },
});
