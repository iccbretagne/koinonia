import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const postSchema = z.object({
  content: z.string().min(1),
  type: z.enum(["GENERAL", "TIMECODE"]).default("GENERAL"),
  timecode: z.number().int().nonnegative().optional(),
  parentId: z.string().optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Commentaires de révision d'un fichier média",
    access: "media:view",
    accessNote: "dans l'église du conteneur du fichier ; ou équipe de l'activité, ou membre de la Communication",
    response: "`{ data: [...] }` : commentaires racines avec leurs réponses, du plus ancien au plus récent",
  },
  POST: {
    summary: "Ajout d'un commentaire de révision",
    description: "`parentId` doit désigner un commentaire du même fichier (400 sinon). Commenter ne demande qu'un droit de lecture.",
    access: "media:view",
    accessNote: "dans l'église du conteneur du fichier ; ou équipe de l'activité, ou membre de la Communication",
    body: postSchema,
    response: "Commentaire créé, auteur inclus",
    status: 201,
  },
});
