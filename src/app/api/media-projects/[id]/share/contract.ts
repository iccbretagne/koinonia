import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { shareCreateSchema } from "../../../_media-share/contract";

export const contract = defineContract({
  GET: {
    summary: "Liens de partage d'un projet média",
    description: "Les jetons sensibles (`VALIDATOR`, `PREVALIDATOR`) n'exposent ni `token` ni `url` sans le droit de gestion.",
    access: "media:view",
    accessNote: "dans l'église du projet ; ou équipe Production Média, ou membre de la Communication ; seul `media:manage` voit les jetons sensibles",
    response: "Liste des liens de partage, avec leur adresse publique",
  },
  POST: {
    summary: "Création d'un lien de partage d'un projet média",
    description: "Types : `VALIDATOR`, `MEDIA`, `MEDIA_ALL`, `PREVALIDATOR`, `GALLERY`. Créer un lien `VALIDATOR` ou `PREVALIDATOR` exige le droit de gestion.",
    access: "media:upload",
    accessNote: "dans l'église du projet ; ou équipe Production Média, ou membre de la Communication ; droit de gestion (`media:manage` ou équipe Production Média) pour les liens sensibles",
    body: shareCreateSchema,
    response: "Lien créé, adresse publique incluse",
    status: 201,
  },
  DELETE: {
    summary: "Révocation d'un lien de partage d'un projet média",
    description: "Révoquer un lien `VALIDATOR` ou `PREVALIDATOR` exige le droit de gestion. Lien introuvable : 404.",
    access: "media:upload",
    accessNote: "dans l'église du projet ; ou équipe Production Média, ou membre de la Communication ; droit de gestion (`media:manage` ou équipe Production Média) pour les liens sensibles",
    query: z.object({ tokenId: z.string().describe("Identifiant du lien à révoquer") }),
    response: "`{ deleted: tokenId }`",
  },
});
