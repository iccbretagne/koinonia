import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Image du site (équipe)",
    description: "Image d'un site pour l'aperçu du brouillon, publiée ou non. 404 si l'image n'appartient pas au site de l'événement.",
    access: "session",
    accessNote: "organisateur ou communication de l'événement (rôle `site`)",
    response: "Image WebP",
    responseType: "image/webp",
  },
});
