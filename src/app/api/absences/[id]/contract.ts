import { z } from "zod";
import { backupSchema } from "../contract";
import { defineContract } from "@/lib/openapi/contract";

export const patchSchema = z
  .discriminatedUnion("action", [
    z.object({ action: z.literal("cancel") }),
    z.object({
      action: z.literal("update"),
      kind: z.enum(["PERIOD"]).optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      eventIds: z.array(z.string().min(1)).max(52).optional(),
      allDepartments: z.boolean().optional(),
      departmentIds: z.array(z.string().min(1)).optional(),
      reason: z.string().max(500).nullable().optional(),
      backups: z.array(backupSchema).max(10).optional(),
    }),
  ])
  .refine(
    (d) => d.action !== "update" || !d.startDate || !d.endDate || new Date(d.endDate) >= new Date(d.startDate),
    { message: "endDate doit être postérieure ou égale à startDate", path: ["endDate"] }
  )
  .refine(
    (d) => d.action !== "update" || d.allDepartments === undefined || d.allDepartments || (d.departmentIds?.length ?? 0) > 0,
    { message: "Au moins un département doit être ciblé", path: ["departmentIds"] }
  );

export const contract = defineContract({
  PATCH: {
    summary: "Annulation ou modification d'une absence",
    description: "`cancel` annule ; `update` modifie tant que l'absence n'est pas passée. Raccourcir ou annuler une période annule ses désistements encore en attente ; la prolonger désiste les nouveaux services (spec 062). Journalisé.",
    access: "session",
    accessNote: "créateur, fiche STAR liée, responsable/ministre du périmètre du membre, ou `absences:manage` global",
    body: patchSchema,
    response: "Absence mise à jour",
  },
});
