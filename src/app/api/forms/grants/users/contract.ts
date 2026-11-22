import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const usersQuerySchema = z.object({
  q: z.string().trim().min(2).max(100).describe("Nom ou email (2 caractères au moins)"),
});

export const contract = defineContract({
  GET: {
    summary: "Formulaires : comptes de l'église à qui donner l'accès",
    description: "10 comptes au plus, ayant un rôle dans l'église courante.",
    access: "forms:manage",
    query: usersQuerySchema,
    response: "Liste `{ id, name, email }`",
  },
});
