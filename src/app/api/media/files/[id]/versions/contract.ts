import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const postSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
  notes: z.string().optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Versions d'un fichier média",
    access: "media:view",
    accessNote: "dans l'église du conteneur du fichier ; ou équipe de l'activité, ou membre de la Communication",
    response: "`{ data: [...] }` : versions (la plus récente d'abord) avec auteur et URL signée de lecture (`streamUrl`, `null` si indisponible)",
  },
  POST: {
    summary: "Nouvelle version d'un fichier média",
    description: "Crée la version suivante, repasse le fichier en `IN_REVIEW` et retourne une URL de dépôt présignée valable une heure. Les photos ne se versionnent pas (400).",
    access: "media:upload",
    accessNote: "dans l'église du conteneur du fichier ; ou équipe de l'activité, ou membre de la Communication",
    body: postSchema,
    response: "`{ version, uploadUrl, expiresIn }`",
    status: 201,
  },
});
