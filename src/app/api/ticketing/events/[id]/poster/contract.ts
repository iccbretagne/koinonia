import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Affiche d'un événement (équipe)",
    description: "Image de l'affiche, quel que soit l'état de l'événement (404 sans affiche).",
    access: "session",
    accessNote: "un rôle sur l'événement",
    response: "Image",
    responseType: "image/*",
  },
  PUT: {
    summary: "Dépôt de l'affiche",
    description: "Corps binaire JPEG, PNG ou WebP, 3 Mo au plus, type vérifié sur le contenu. Remplace l'affiche précédente ; journalisé.",
    access: "session",
    accessNote: "organisateur de l'événement",
    body: { contentType: "image/*", description: "Image de l'affiche" },
    response: "`{ ok: true }`",
  },
  DELETE: {
    summary: "Retrait de l'affiche",
    access: "session",
    accessNote: "organisateur de l'événement",
    response: "`{ ok: true }`",
  },
});
