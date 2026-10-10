import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const scheduleSchema = z.object({
  startsAt: z.string().datetime("Date de début invalide"),
  endsAt: z.string().datetime().nullable().optional(),
  location: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
}).refine(
  (d) => !d.endsAt || new Date(d.endsAt) > new Date(d.startsAt),
  { message: "L'heure de fin doit être après l'heure de début", path: ["endsAt"] }
);

export const contract = defineContract({
  PATCH: {
    summary: "Planification d'une demande de rendez-vous pastoral",
    description: "Demande `VALIDATED` et affectée à un profil pastoral uniquement. Crée l'entrée d'agenda, passe la demande à `SCHEDULED`, notifie l'accompagnant et envoie la confirmation par email au demandeur. Journalisé.",
    access: "agenda:manage",
    body: scheduleSchema,
    status: 201,
    response: "Entrée d'agenda créée",
  },
});
