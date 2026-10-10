import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const signSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string(),
  size: z.number().int().positive(),
});

export const contract = defineContract({
  POST: {
    summary: "URL présignée de dépôt d'une photo",
    description: "Vérifie le nom, le type et la taille annoncés, puis retourne une URL de dépôt direct vers une zone de quarantaine. Le dépôt se confirme ensuite par `POST .../photos/confirm` avec le `quarantineId`.",
    access: "media:upload",
    accessNote: "dans l'église de l'événement ; ou équipe Photos, ou membre de la Communication",
    body: signSchema,
    response: "`{ quarantineId, url }`",
  },
});
