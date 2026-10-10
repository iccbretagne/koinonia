import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const jobSchema = z.object({
  title:        z.string().min(1).max(200),
  type:         z.enum(["EMPLOI", "STAGE", "ALTERNANCE"]),
  company:      z.string().min(1).max(150),
  location:     z.string().max(150).optional().nullable(),
  description:  z.string().min(1),
  duration:     z.string().max(100).optional().nullable(),
  deadline:     z.string().datetime().optional().nullable(),
  contactEmail: z.string().email().max(150).optional().nullable(),
  contactUrl:   z.string().url().max(500).optional().nullable(),
});

export const contract = defineContract({
  GET: {
    summary: "Liste des offres d'emploi",
    description: "Par défaut les offres publiées dont l'échéance n'est pas dépassée ; `status=ARCHIVED` liste les offres archivées.",
    access: "session",
    accessNote: "toute personne connectée (module emploi transversal aux églises)",
    query: z.object({
      type: z.enum(["EMPLOI", "STAGE", "ALTERNANCE"]).optional().describe("Filtre sur le type de contrat"),
      status: z.enum(["PUBLISHED", "ARCHIVED"]).optional().describe("`PUBLISHED` (défaut) ou `ARCHIVED`"),
    }),
    response: "Offres, des plus récentes aux plus anciennes, avec leur auteur",
  },
  POST: {
    summary: "Publication d'une offre d'emploi",
    description: "Notifie les abonnés intéressés par ce type de contrat (in-app et/ou email selon leur abonnement), sans bloquer la réponse.",
    access: "jobs:post",
    accessNote: "permission transverse aux églises (`requirePlatformPermission`)",
    body: jobSchema,
    response: "Offre créée, avec son auteur",
    status: 201,
  },
});
