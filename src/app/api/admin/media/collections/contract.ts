import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const createSchema = z.object({
  churchId: z.string().min(1),
  label: z.string().trim().min(1, "L'étiquette est obligatoire"),
  scope: z.enum(["photos", "files", "both"]),
  eventIds: z.array(z.string()).default([]),
  projectIds: z.array(z.string()).default([]),
  expiresInDays: z.number().int().positive().optional(),
  includeAllPhotos: z.boolean().optional(),
});

export const contract = defineContract({
  POST: {
    summary: "Création d'un lien de partage multi-sources",
    description: "Au moins un événement photo ou un projet visuel, tous de l'église. Journalisé.",
    access: "media:manage",
    accessNote: "ou équipe Photos, Production Média ou Communication de l'église ; une équipe ne partage que son activité (spec 049)",
    body: createSchema,
    status: 201,
    response: "Jeton de partage",
  },
});
