import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Points d'entrée Auth.js (session, csrf, providers, callback)",
    description: "Géré par NextAuth v5 ; non destiné à un appel direct.",
    access: "public",
    response: "Réponse Auth.js",
  },
  POST: {
    summary: "Points d'entrée Auth.js (connexion, déconnexion)",
    description: "Géré par NextAuth v5, limité en débit.",
    access: "public",
    body: { contentType: "application/x-www-form-urlencoded", description: "Formulaire Auth.js (csrfToken, callbackUrl…)" },
    response: "Réponse ou redirection Auth.js",
  },
});
