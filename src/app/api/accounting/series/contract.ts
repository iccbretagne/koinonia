import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const createSchema = z.object({
  departmentId:      z.string().min(1),
  label:             z.string().min(1).max(200),
  description:       z.string().optional(),
  amount:            z.number().positive(),
  recurrenceEvery:   z.number().int().min(1).max(99),
  recurrenceUnit:    z.enum(["WEEK", "MONTH"]),
  firstOccurrenceDate: z.string().datetime(),
});

export const contract = defineContract({
  GET: {
    summary: "Séries de demandes récurrentes",
    access: "accounting:view",
    accessNote: "dans l'église courante",
    query: z.object({
      status: z.string().optional(),
    }),
    response: "Séries et leurs occurrences",
  },
  POST: {
    summary: "Création d'une série récurrente",
    description: "Crée aussi la première occurrence.",
    access: "accounting:submit",
    accessNote: "dans l'église courante",
    body: createSchema,
    status: 201,
    response: "Série créée",
  },
});
