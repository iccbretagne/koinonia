import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const querySchema = z
  .object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    allDepartments: z.enum(["true", "false"]).default("true"),
    departmentIds: z.string().optional(),
  })
  .refine((q) => new Date(q.endDate) >= new Date(q.startDate), {
    message: "endDate doit être postérieure ou égale à startDate",
    path: ["endDate"],
  });

export const contract = defineContract({
  GET: {
    summary: "Services qu'une période désisterait",
    description: "Services planifiés, couverts, avant leur date limite et sans désistement en attente (spec 062). Indicatif : l'enregistrement recalcule.",
    access: "session",
    accessNote: "soi-même (fiche STAR liée au compte), ou `absences:manage` dans le périmètre départemental du STAR",
    query: z.object({
      churchId: z.string(),
      memberId: z.string().describe("Fiche STAR de la personne absente"),
      startDate: z.string().describe("ISO 8601"),
      endDate: z.string().describe("ISO 8601, postérieure ou égale à startDate"),
      allDepartments: z.enum(["true", "false"]).optional().describe("Défaut true"),
      departmentIds: z.string().optional().describe("Identifiants séparés par des virgules"),
    }),
    response: "Services concernés, pour l'avertissement du formulaire",
  },
});
