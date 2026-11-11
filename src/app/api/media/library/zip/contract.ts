import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const zipBodySchema = z
  .object({
    photoIds: z.array(z.string().min(1)).default([]),
    fileIds: z.array(z.string().min(1)).default([]),
  })
  .refine((b) => b.photoIds.length + b.fileIds.length > 0, "Sélection vide")
  .refine((b) => b.photoIds.length + b.fileIds.length <= 200, "200 médias au plus par archive");

export const contract = defineContract({
  POST: {
    summary: "Galerie médias : archive ZIP d'une sélection",
    description: "200 médias au plus. Seuls les médias validés de l'église courante sont inclus (les autres identifiants sont ignorés), rangés par événement ou projet. Aucun média valide : 404.",
    access: "media:view",
    accessNote: "même accès que la galerie, accès nominatif compris (spec 080)",
    body: zipBodySchema,
    response: "Archive ZIP en flux",
    responseType: "application/zip",
  },
});
