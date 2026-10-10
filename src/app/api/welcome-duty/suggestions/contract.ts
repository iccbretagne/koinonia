import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Familles suggérées pour une permanence d'accueil",
    description: "Familles actives du pool, hors celles déjà affectées à l'événement ; celles jamais servies d'abord, puis par dernier service le plus ancien.",
    access: "events:manage",
    accessNote: "dans l'église courante",
    query: z.object({
      eventId: z.string().optional().describe("Événement dont on exclut les familles déjà affectées"),
      limit: z.string().optional().describe("Nombre de suggestions (5 par défaut, 20 au plus)"),
    }),
    response: "Liste de `{ id, familyId, familyName, lastServedAt }`",
  },
});
