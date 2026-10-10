import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const delay = z.number().int().min(1).max(365);

export const schema = z.object({
  churchId: z.string().min(1),
  unassignedDelayDays: delay,
  unscheduledDelayDays: delay,
});

export const contract = defineContract({
  GET: {
    summary: "Délais de relance du suivi pastoral",
    access: "care:qualify",
    query: z.object({
      churchId: z.string(),
    }),
    response: "Réglages de l'église",
  },
  PUT: {
    summary: "Mise à jour des délais de relance",
    description: "Délais en jours avant relance d'une demande non affectée ou non planifiée.",
    access: "care:qualify",
    body: schema,
    response: "Réglages enregistrés",
  },
});
