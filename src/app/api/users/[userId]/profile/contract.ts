import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100),
});

export const contract = defineContract({
  PATCH: {
    summary: "Modification du nom d'affichage d'un utilisateur",
    description: "Journalisé.",
    access: "session",
    accessNote: "son propre profil, ou `users:manage` dans une église partagée avec l'utilisateur visé (Super Admin : tout utilisateur)",
    body: updateProfileSchema,
    response: "Utilisateur mis à jour (`id`, `displayName`)",
  },
});
