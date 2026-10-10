import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Téléchargement local d'une pièce (sans S3)",
    description: "Actif seulement quand S3 n'est pas configuré (développement) ; 404 sinon.",
    access: "session",
    accessNote: "mêmes règles que le téléchargement principal",
    query: z.object({
      key: z.string().describe("Clé de stockage"),
      filename: z.string().optional().describe("Nom du fichier téléchargé"),
    }),
    responseType: "application/octet-stream",
    response: "Fichier en pièce jointe",
  },
});
