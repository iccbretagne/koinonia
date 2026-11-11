import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const usersQuerySchema = z.object({
  q: z.string().trim().min(2).max(100).describe("Nom ou email (2 caractères au moins)"),
});

export const contract = defineContract({
  GET: {
    summary: "Galerie médias : comptes de l'église à qui donner un accès",
    description: "10 comptes au plus, ayant un rôle dans l'église courante.",
    access: "media:manage",
    accessNote: "Admin de l'église, ou Ministre d'un ministère qui porte une équipe média (spec 080)",
    query: usersQuerySchema,
    response: "Liste `{ id, name, email }`",
  },
});
