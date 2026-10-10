import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const restoreSchema = z.object({
  key: z
    .string()
    .startsWith("backups/")
    .endsWith(".sql.gz"),
});

export const contract = defineContract({
  POST: {
    summary: "Restauration de la base depuis une sauvegarde",
    description: "Remplace la base entière. Journalisé.",
    access: "superAdmin",
    body: restoreSchema,
    response: "Résultat de la restauration",
  },
});
