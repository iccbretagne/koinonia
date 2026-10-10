import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const schema = z.object({
  defaultCoverKey: z.string().nullable().optional(),
  sequenceTemplate: z.array(z.string().min(1)).optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Paramètres audio de l'église courante",
    access: "audio:manage",
    response: "Couverture par défaut et modèle de séquences",
  },
  PUT: {
    summary: "Mise à jour des paramètres audio",
    access: "audio:manage",
    body: schema,
    response: "Paramètres mis à jour",
  },
});
