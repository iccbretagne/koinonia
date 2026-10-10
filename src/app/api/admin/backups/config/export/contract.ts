import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const exportSchema = z.object({
  scope: z.union([z.literal("all"), z.array(z.string())]),
  categories: z.array(z.enum(["structure", "members", "links"])).min(1),
});

export const contract = defineContract({
  POST: {
    summary: "Export de la configuration structurelle",
    description: "Églises, ministères, départements, membres et liaisons, au format JSON. Journalisé.",
    access: "superAdmin",
    body: exportSchema,
    responseType: "application/json",
    response: "Fichier JSON en pièce jointe",
  },
});
