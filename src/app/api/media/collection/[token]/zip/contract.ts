import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const bodySchema = z.object({
  photoIds: z.array(z.string()).optional(),
  fileIds:  z.array(z.string()).optional(),
});

export const contract = defineContract({
  POST: {
    summary: "Archive ZIP d'une collection de partage",
    description: "Photos approuvées et visuels approuvés selon la portée de la collection, rangés par événement ou projet. Sans `photoIds` ni `fileIds`, tout est inclus. Aucun fichier : 404.",
    access: "token",
    accessNote: "jeton de partage `COLLECTION`",
    body: bodySchema,
    response: "Archive ZIP en flux",
    responseType: "application/zip",
  },
});
