import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  DELETE: {
    summary: "MCP : révoquer une connexion d'assistant",
    description:
      "Par la personne connectée elle-même, ou par un administrateur de l'église de la connexion (`church:settings`). Effet immédiat ; journalisé. Autre cas : 404.",
    access: "session",
    accessNote: "propriétaire de la connexion, ou `church:settings` dans l'église de la connexion",
    status: 204,
    response: "Aucun contenu",
  },
});
