import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Réinitialisation de l'authentification du navigateur",
    description: "Supprime tous les cookies Auth.js, sans session requise : sert précisément quand la session est cassée (issue #505).",
    access: "public",
    status: 307,
    response: "Redirection vers la page de connexion",
  },
});
