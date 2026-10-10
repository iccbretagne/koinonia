import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Téléchargement d'une sauvegarde",
    access: "superAdmin",
    query: z.object({
      key: z.string().describe("Clé de la sauvegarde (contrôlée contre la traversée de chemin)"),
    }),
    response: "`{ url }` : URL présignée de téléchargement",
  },
});
