import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "URL de téléchargement d'une photo ou d'un visuel validé",
    description: "Lien `MEDIA` : uniquement les photos et fichiers validés ; lien `MEDIA_ALL` : tout sauf les brouillons.",
    access: "token",
    accessNote: "jeton de partage `MEDIA` ou `MEDIA_ALL`",
    response: "URL signée de téléchargement de l'élément",
  },
});
