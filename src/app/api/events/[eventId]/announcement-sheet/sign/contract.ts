import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const signSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string(),
  size: z.number().int().positive(),
});

export const contract = defineContract({
  POST: {
    summary: "Adresse signée de dépôt d'une feuille d'annonces",
    description: "Contrôle le type et la taille du fichier avant de délivrer l'adresse ; le dépôt se confirme ensuite sur la route de la feuille.",
    access: "planning:view",
    accessNote: "et droit de dépôt : Super Admin, Admin, Secrétaire, ou membre d'un département Secrétariat (403 sinon)",
    body: signSchema,
    response: "`{ key, url }` : clé de stockage et adresse signée de téléversement",
  },
});
