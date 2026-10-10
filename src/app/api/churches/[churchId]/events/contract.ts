import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Liste des événements d'une église",
    access: "events:view",
    query: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Restreint au mois visé, au format AAAA-MM") }),
    response: "Événements triés par date, départements inclus",
  },
});
