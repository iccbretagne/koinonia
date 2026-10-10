import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Galerie d'un lien de partage",
    description: "Photos d'un événement ou fichiers d'un projet.",
    access: "token",
    accessNote: "jeton de partage `GALLERY`",
    response: "Contenu de la galerie",
  },
});
