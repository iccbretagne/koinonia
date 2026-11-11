import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const sourcesQuerySchema = z.object({
  q: z.string().trim().max(100).optional().describe("Recherche par nom"),
});

export const contract = defineContract({
  GET: {
    summary: "Galerie médias : événements et projets ayant des médias validés",
    description: "Alimente le filtre « Événement ou projet » (50 de chaque au plus, les plus récents d'abord).",
    access: "media:view",
    accessNote: "même accès que la galerie (spec 080)",
    query: sourcesQuerySchema,
    response: "Liste `{ type, id, name }`",
  },
});
