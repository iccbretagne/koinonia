import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const updateGrantSchema = z.object({
  expiresAt: z.string().datetime({ offset: true }).nullable().describe("Nouvelle date de fin (future) ou `null`"),
});

export const contract = defineContract({
  PATCH: {
    summary: "Galerie médias : modifier la date de fin d'un accès nominatif",
    description: "Accès d'une autre église : 404. Date passée : 400. Journalisé.",
    access: "media:manage",
    accessNote: "Admin de l'église, ou Ministre d'un ministère qui porte une équipe média (spec 080)",
    body: updateGrantSchema,
    response: "Accès mis à jour",
  },
  DELETE: {
    summary: "Galerie médias : retirer un accès nominatif",
    description: "Effet immédiat. Accès d'une autre église : 404. Journalisé.",
    access: "media:manage",
    accessNote: "Admin de l'église, ou Ministre d'un ministère qui porte une équipe média (spec 080)",
    status: 204,
    response: "Aucun contenu",
  },
});
