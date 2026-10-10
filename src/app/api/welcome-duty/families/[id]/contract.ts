import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const patchSchema = z.object({
  active:     z.boolean().optional(),
  familyName: z.string().trim().min(1).max(100).optional(),
});

export const contract = defineContract({
  PATCH: {
    summary: "Modification d'une famille du pool",
    description: "Active ou désactive la famille et/ou change son nom ; 404 si elle n'appartient pas à l'église courante.",
    access: "events:manage",
    accessNote: "dans l'église courante",
    body: patchSchema,
    response: "Famille mise à jour",
  },
  DELETE: {
    summary: "Retrait d'une famille du pool",
    description: "404 si elle n'appartient pas à l'église courante.",
    access: "events:manage",
    accessNote: "dans l'église courante",
    response: "`{ success: true }`",
  },
});
