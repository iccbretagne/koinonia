import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date au format AAAA-MM-JJ");

/** Filtres de la galerie (spec 080), lus depuis l'adresse de la page ou de la route. */
export const libraryQuerySchema = z.object({
  type: z.enum(["all", "photos", "visuals"]).default("all").describe("Type de média"),
  from: day.optional().describe("Début de période (incluse)"),
  to: day.optional().describe("Fin de période (incluse)"),
  source: z
    .string()
    .regex(/^(event|project):[\w-]+$/, "Source invalide")
    .optional()
    .describe("Événement ou projet d'origine, `event:<id>` ou `project:<id>`"),
  q: z.string().trim().max(100).optional().describe("Recherche par nom de fichier, d'événement ou de projet"),
  order: z.enum(["desc", "asc"]).default("desc").describe("Tri par date"),
  cursor: z.string().max(200).optional().describe("Curseur de la page suivante"),
  limit: z.coerce.number().int().min(1).max(60).default(60).describe("Taille de page"),
});

export type LibraryQuery = z.infer<typeof libraryQuerySchema>;

export const contract = defineContract({
  GET: {
    summary: "Galerie médias : une page de médias validés",
    description:
      "Photos approuvées et visuels validés (approuvés ou approuvés définitivement, dernière version) de l'église courante, triés par date (date de l'événement pour une photo, dépôt de la dernière version pour un visuel). Pagination par curseur ; `total` compte tous les résultats des filtres.",
    access: "media:view",
    accessNote: "ou équipe Photos, Production Média, Communication, Ministre de ces équipes, ou accès nominatif à la galerie (spec 080)",
    query: libraryQuerySchema,
    response: "`{ items, nextCursor, total }`",
  },
});
