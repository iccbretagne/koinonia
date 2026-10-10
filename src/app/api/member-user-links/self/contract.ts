import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const schema = z.object({
  memberId: z.string(),
  churchId: z.string(),
});

export const contract = defineContract({
  POST: {
    summary: "Auto-liaison de son compte à une fiche STAR",
    description:
      "Self-service par email, sans validation d'un administrateur : le serveur vérifie que l'email du compte égale celui de la fiche, que la fiche appartient à l'église et qu'elle n'est pas déjà liée (409 sinon). " +
      "Le rôle STAR est attribué uniquement si le compte n'a encore aucun rôle dans l'église. Journalisé ; limité en débit par utilisateur.",
    access: "session",
    accessNote: "toute personne connectée, pour son propre compte",
    body: schema,
    status: 201,
    response: "Lien créé",
  },
});
