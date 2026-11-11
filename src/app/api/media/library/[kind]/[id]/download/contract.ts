import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Galerie médias : téléchargement d'un original",
    description: "`kind` vaut `photo` ou `file`. Le média doit appartenir à l'église courante et être validé (404 sinon). Redirige vers une adresse de téléchargement signée et temporaire.",
    access: "media:view",
    accessNote: "même accès que la galerie, accès nominatif compris (spec 080)",
    status: 302,
    response: "Redirection vers l'original haute définition",
  },
});
