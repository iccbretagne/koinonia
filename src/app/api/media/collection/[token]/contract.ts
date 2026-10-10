import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Contenu d'une collection de partage",
    description: "Collection multi-sources (photos et visuels). Configuration manquante : 400.",
    access: "token",
    accessNote: "jeton de partage `COLLECTION`",
    response: "Groupes de photos et de fichiers, avec `totalPhotos` et `totalFiles`",
  },
});
