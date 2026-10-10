import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const confirmSchema = z.object({
  quarantineId: z.string().uuid(),
  filename: z.string().min(1),
  mimeType: z.string(),
  size: z.number().int().positive(),
});

export const contract = defineContract({
  POST: {
    summary: "Confirmation du dépôt d'une photo",
    description: "Récupère le fichier déposé en quarantaine, le traite (original et miniature) et crée la photo au statut `PENDING`. Fichier absent de la quarantaine : 400. Suite de `POST .../photos/sign`.",
    access: "media:upload",
    accessNote: "dans l'église de l'événement ; ou équipe Photos, ou membre de la Communication",
    body: confirmSchema,
    response: "`{ id, filename }` de la photo créée",
    status: 201,
  },
});
