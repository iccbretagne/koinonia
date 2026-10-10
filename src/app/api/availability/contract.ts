import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const putSchema = z.object({
  churchId: z.string().min(1),
  memberId: z.string().min(1).optional(),
  answers: z
    .array(
      z.object({
        eventId: z.string().min(1),
        answer: z.enum(["AVAILABLE", "IF_NEEDED", "UNAVAILABLE"]),
        departmentIds: z.array(z.string().min(1)).min(1).optional(),
      })
    )
    .min(1)
    .max(200),
});

export const contract = defineContract({
  GET: {
    summary: "Disponibilités d'un STAR pour un mois",
    access: "session",
    accessNote: "soi-même (fiche STAR liée au compte) ; pour un autre STAR, `planning:edit` et STAR dans le périmètre départemental",
    query: z.object({
      churchId: z.string(),
      month: z.string().optional().describe("AAAA-MM, défaut mois courant"),
      memberId: z.string().optional().describe("Fiche STAR visée, défaut la sienne"),
    }),
    response: "`{ memberId, isSelf, … }` : événements du mois et réponses",
  },
  PUT: {
    summary: "Enregistrement de réponses de disponibilité",
    description: "Réponses par événement (`AVAILABLE`, `IF_NEEDED`, `UNAVAILABLE`), éventuellement limitées à certains départements.",
    access: "session",
    accessNote: "soi-même ; pour un autre STAR, `planning:edit` et départements dans le périmètre",
    body: putSchema,
    response: "Réponses enregistrées",
  },
});
