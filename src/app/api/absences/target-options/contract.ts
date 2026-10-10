import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Départements et événements ciblables par une absence",
    access: "session",
    accessNote: "soi-même (fiche STAR liée au compte), ou `absences:manage` dans le périmètre départemental du STAR",
    query: z.object({
      churchId: z.string(),
      memberId: z.string().describe("Fiche STAR de la personne absente"),
    }),
    response: "Départements du STAR et événements à venir ciblables (spec 050)",
  },
});
