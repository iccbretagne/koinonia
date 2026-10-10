import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Connexion de développement sans Google",
    description: "Désactivée hors développement (404). Crée une session en base pour un compte de test (`prisma/fixtures/dev-users.ts`) et pose le cookie de session.",
    access: "public",
    body: { contentType: "application/x-www-form-urlencoded", description: "`devUserKey` : clé d'un compte de test" },
    status: 302,
    response: "Redirection vers `/dashboard` (ou `/` si le compte est inconnu)",
  },
});
