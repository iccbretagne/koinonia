import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const schema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
  type: z.enum(["VISUAL", "VIDEO"]),
  mediaEventId: z.string().optional(),
  mediaProjectId: z.string().optional(),
}).refine((d) => (!!d.mediaEventId) !== (!!d.mediaProjectId), {
  message: "Fournir exactement l'un de mediaEventId ou mediaProjectId, pas les deux"
});

export const contract = defineContract({
  POST: {
    summary: "URL présignée de dépôt d'un visuel ou d'une vidéo",
    description: "Crée l'enregistrement du fichier (statut `DRAFT`) et retourne une URL de dépôt direct valable une heure ; le dépôt se confirme ensuite par `PATCH /api/media/files/{id}` avec `confirmUpload`. Fournir exactement l'un de `mediaEventId` ou `mediaProjectId`. Types MIME limités (images, PDF, vidéos) et taille bornée (400 sinon). Les photos passent par `/api/media-events/{id}/photos`. Limité en débit.",
    access: "media:upload",
    accessNote: "dans l'église du conteneur (événement média : activité Photos ; projet : activité Visuels) ; ou équipe de l'activité, ou membre de la Communication",
    body: schema,
    response: "`{ fileId, uploadUrl, key, expiresIn }`",
    status: 201,
  },
});
