import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  role: z.enum(["PASTEUR", "ASSISTANT_PASTEUR", "BERGER"]).optional(),
  userId: z.string().nullable().optional(),
});

export const contract = defineContract({
  PATCH: {
    summary: "Modification d'un profil pastoral",
    description: "Journalisé.",
    access: "church:settings",
    body: updateSchema,
    response: "Profil mis à jour",
  },
  DELETE: {
    summary: "Suppression d'un profil pastoral",
    description: "Refusée (400) tant que le profil a des entrées d'agenda. Journalisé.",
    access: "church:settings",
    response: "`{ success: true }`",
  },
});
