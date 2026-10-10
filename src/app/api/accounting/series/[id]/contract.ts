import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const patchSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]),
});

export const contract = defineContract({
  PATCH: {
    summary: "Changement de statut d'une série",
    access: "accounting:submit",
    accessNote: "son auteur, dans l'église de la série",
    body: patchSchema,
    response: "Série mise à jour",
  },
});
