import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const putSchema = z.object({
  emailEnabled: z.boolean().optional(),
  domains: z.record(z.string(), z.boolean()).optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Préférences de notification de l'utilisateur",
    access: "session",
    accessNote: "préférences de l'appelant ; seuls les domaines visibles pour lui sont listés",
    response: "Vue des préférences : interrupteur général et une ligne par domaine visible",
  },
  PUT: {
    summary: "Mise à jour des préférences de notification",
    description: "Un domaine inconnu ou non accessible à l'utilisateur est refusé (400). Voir ADR-0016 (spec 053).",
    access: "session",
    accessNote: "préférences de l'appelant",
    body: putSchema,
    response: "Vue des préférences à jour",
  },
});
