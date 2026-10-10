import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Recherche de STAR dans toute l'église",
    description: "Sans filtre de périmètre, pour retrouver un STAR d'un autre département avant de le rattacher au sien. La réponse se limite à l'identité et aux départements d'appartenance.",
    access: "members:manage",
    query: z.object({
      churchId: z.string().describe("Église visée"),
      q: z.string().optional().describe("Texte recherché dans le nom"),
    }),
    response: "Liste de STAR (identité et départements)",
  },
});
