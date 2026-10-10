import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const schema = z.object({
  churchId: z.string().min(1),
  enabled: z.boolean(),
  openMonthsBefore: z.number().int().min(1).max(6),
  closeDaysBefore: z.number().int().min(1).max(30),
  relanceDaysBefore: z.number().int().min(1).max(30),
  planningNoticeDelayMinutes: z.number().int().min(5, "Le délai doit être d'au moins 5 minutes").max(120, "Le délai ne peut pas dépasser 2 heures"),
});

export const contract = defineContract({
  GET: {
    summary: "Réglages de la collecte des disponibilités",
    access: "availability:settings",
    query: z.object({
      churchId: z.string(),
    }),
    response: "Réglages de l'église",
  },
  PUT: {
    summary: "Mise à jour des réglages de collecte",
    description: "Ouverture, clôture et relance automatiques ; délai d'envoi de l'avis de planning. Journalisé.",
    access: "availability:settings",
    body: schema,
    response: "Réglages enregistrés",
  },
});
