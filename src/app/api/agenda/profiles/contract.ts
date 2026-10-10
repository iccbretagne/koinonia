import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const createSchema = z.object({
  churchId: z.string().min(1, "L'église est requise"),
  name: z.string().min(1, "Le nom est requis"),
  email: z.string().email("Email invalide").nullable().optional(),
  role: z.enum(["PASTEUR", "ASSISTANT_PASTEUR", "BERGER"]),
  userId: z.string().nullable().optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Profils pastoraux de l'église",
    access: "agenda:view",
    query: z.object({
      churchId: z.string(),
    }),
    response: "Profils pastoraux",
  },
  POST: {
    summary: "Création d'un profil pastoral",
    description: "Peut être lié à un compte qui a un rôle dans l'église. Journalisé.",
    access: "church:settings",
    body: createSchema,
    status: 201,
    response: "Profil créé",
  },
});
