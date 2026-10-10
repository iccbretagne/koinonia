import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { shareCreateSchema } from "../../../_media-share/contract";

export const contract = defineContract({
  GET: {
    summary: "Liens de partage d'un événement média",
    description: "Les jetons sensibles (`VALIDATOR`, `PREVALIDATOR`) n'exposent ni `token` ni `url` sans le droit de gestion.",
    access: "media:view",
    accessNote: "dans l'église de l'événement ; ou équipe Photos, ou membre de la Communication ; `media:manage` ou équipe Photos pour voir les jetons sensibles",
    response: "Liste des liens de partage, avec leur adresse publique",
  },
  POST: {
    summary: "Création d'un lien de partage d'un événement média",
    description: "Types : `VALIDATOR`, `MEDIA`, `MEDIA_ALL`, `PREVALIDATOR`, `GALLERY`. Créer un lien `VALIDATOR` ou `PREVALIDATOR` exige le droit de gestion. Un seul lien `PREVALIDATOR` par événement (409). Créer un lien `VALIDATOR` ou `MEDIA` alors que la prévalidation est en cours avec des photos restantes : 409.",
    access: "media:upload",
    accessNote: "dans l'église de l'événement ; ou équipe Photos, ou membre de la Communication ; droit de gestion (`media:manage` ou équipe Photos) pour les liens sensibles",
    body: shareCreateSchema,
    response: "Lien créé, adresse publique incluse",
    status: 201,
  },
  DELETE: {
    summary: "Révocation d'un lien de partage d'un événement média",
    description: "Révoquer un lien `VALIDATOR` ou `PREVALIDATOR` exige le droit de gestion. Lien introuvable : 404.",
    access: "media:upload",
    accessNote: "dans l'église de l'événement ; ou équipe Photos, ou membre de la Communication ; droit de gestion (`media:manage` ou équipe Photos) pour les liens sensibles",
    query: z.object({ tokenId: z.string().describe("Identifiant du lien à révoquer") }),
    response: "`{ deleted: tokenId }`",
  },
});
