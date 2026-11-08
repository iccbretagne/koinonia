import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const settingsSchema = z
  .object({
    firstReminderDays: z.coerce.number().int().min(1).max(60),
    reminderIntervalDays: z.coerce.number().int().min(1).max(30),
  })
  .strict();

export const contract = defineContract({
  GET: {
    summary: "Délais de relance des justificatifs",
    description: "Jours entre la remise des fonds et la première relance, puis entre deux relances (défauts : 7 et 7).",
    access: "accounting:manage",
    accessNote: "dans l'église courante",
    response: "`{ firstReminderDays, reminderIntervalDays }`",
  },
  PUT: {
    summary: "Régler les délais de relance des justificatifs",
    description: "S'applique aux relances suivantes de toutes les justifications en cours. Journalisé.",
    access: "accounting:manage",
    accessNote: "dans l'église courante",
    body: settingsSchema,
    response: "`{ firstReminderDays, reminderIntervalDays }`",
  },
});
