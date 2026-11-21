import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Dépôt d'une image du site",
    description: "Formulaire multipart, champ `file` : JPEG, PNG ou WebP, 8 Mo au plus, type vérifié sur le contenu. L'image est redressée, réduite à 2400 px au plus, convertie en WebP et dépouillée de toute métadonnée. Journalisé.",
    access: "session",
    accessNote: "organisateur ou communication de l'événement (rôle `site`)",
    body: { contentType: "multipart/form-data", description: "Champ `file` : l'image" },
    response: "`{ id, width, height }`",
  },
});
