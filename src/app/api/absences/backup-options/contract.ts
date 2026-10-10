import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Backups possibles pour l'absence d'un STAR",
    description: "Informe l'affichage seulement : `POST`/`PATCH` revalident les backups.",
    access: "session",
    accessNote: "soi-même (fiche STAR liée au compte), ou `absences:manage` dans le périmètre départemental du STAR",
    query: z.object({
      churchId: z.string(),
      memberId: z.string().describe("Fiche STAR de la personne absente"),
    }),
    response: "Backups proposables dans le périmètre de la personne absente (vide si elle n'est pas responsable)",
  },
});
