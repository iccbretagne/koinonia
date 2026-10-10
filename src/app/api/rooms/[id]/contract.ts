import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  capacity: z.number().int().positive().nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const contract = defineContract({
  PATCH: {
    summary: "Modification d'une salle",
    description: "Nom, capacité, lieu, activation. Journalisé.",
    access: "rooms:manage",
    accessNote: "dans l'église propriétaire de la salle",
    body: patchSchema,
    response: "Salle mise à jour",
  },
});
