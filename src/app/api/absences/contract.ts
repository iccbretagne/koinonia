import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const backupSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("STAR"), memberId: z.string().min(1) }),
  z.object({ type: z.literal("RESPONSIBLE"), userChurchRoleId: z.string().min(1) }),
]);

export const createSchema = z
  .object({
    churchId: z.string().min(1),
    memberId: z.string().min(1),
    kind: z.enum(["PERIOD"]).default("PERIOD"),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    eventIds: z.array(z.string().min(1)).max(52).default([]),
    allDepartments: z.boolean().default(true),
    departmentIds: z.array(z.string().min(1)).default([]),
    reason: z.string().max(500).nullable().optional(),
    backups: z.array(backupSchema).max(10).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.kind === "PERIOD") {
      if (!d.startDate || !d.endDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "startDate et endDate sont requis pour une absence sur une période",
          path: ["startDate"],
        });
      } else if (new Date(d.endDate) < new Date(d.startDate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "endDate doit être postérieure ou égale à startDate",
          path: ["endDate"],
        });
      }
    } else if (d.eventIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Au moins un événement doit être ciblé",
        path: ["eventIds"],
      });
    }
    if (!d.allDepartments && d.departmentIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Au moins un département doit être ciblé",
        path: ["departmentIds"],
      });
    }
  });

export const contract = defineContract({
  GET: {
    summary: "Liste des absences",
    description: "`scope=all` montre les absences « tous départements » d'un membre du périmètre et les absences ciblées touchant au moins un département du périmètre, plus les réponses « Pas disponible » à venir (spec 058).",
    access: "session",
    accessNote: "`scope=self` : aucune permission, absences des fiches liées au compte ; `scope=all` : `absences:view`, borné au périmètre départemental",
    query: z.object({
      churchId: z.string(),
      scope: z.enum(["self", "all"]).optional().describe("Défaut self"),
      ministryId: z.string().optional(),
      departmentId: z.string().optional(),
      role: z.string().optional().describe("Absences déclarées par une personne qui détient ce rôle dans l'église"),
    }),
    response: "Absences (et, en `scope=all`, réponses « Pas disponible ») du périmètre",
  },
  POST: {
    summary: "Déclaration d'une absence",
    description: "Période (dates) ou liste d'événements, tous départements du STAR ou départements ciblés (spec 050). Les backups ne sont possibles que si la personne absente a un compte responsable (spec 014). Une période désiste le STAR des services planifiés qu'elle couvre avant leur date limite (spec 062). Journalisé.",
    access: "session",
    accessNote: "auto-déclaration sans permission ; pour un tiers, `absences:manage` et STAR dans le périmètre",
    body: createSchema,
    status: 201,
    response: "Absence créée",
  },
});
