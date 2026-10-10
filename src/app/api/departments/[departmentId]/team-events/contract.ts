import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

function isValidDate(val: string) {
  return !Number.isNaN(new Date(val).getTime());
}

export const writeFields = {
  title: z.string().trim().min(1, "Le titre est requis").max(200),
  startsAt: z.string().min(1, "La date de début est requise").refine(isValidDate, "Date de début invalide"),
  endsAt: z.string().min(1, "La date de fin est requise").refine(isValidDate, "Date de fin invalide"),
  location: z.string().trim().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
};

export const createSchema = z
  .object({
    ...writeFields,
    recurrence: z
      .object({
        rule: z.enum(["weekly", "biweekly", "monthly"]),
        until: z.string().min(1, "La date de fin de récurrence est requise").refine(isValidDate, "Date de fin de récurrence invalide"),
      })
      .nullable()
      .optional(),
  })
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: "L'heure de fin doit être postérieure à l'heure de début",
    path: ["endsAt"],
  });

export const contract = defineContract({
  GET: {
    summary: "Liste des événements d'équipe d'un département",
    description: "Rendez-vous internes au département (répétition, réunion, formation), distincts des événements d'église (spec 044).",
    access: "planning:department",
    accessNote: "borné au périmètre départemental de l'appelant",
    query: z.object({ period: z.enum(["upcoming", "past"]).optional().describe("`past` pour les événements passés, sinon à venir (défaut)") }),
    response: "Événements d'équipe du département",
  },
  POST: {
    summary: "Création d'un événement d'équipe",
    description: "Avec `recurrence`, génère une série d'occurrences jusqu'à la date `until` ; la série peut être tronquée (`truncated`). Journalisé.",
    access: "planning:edit",
    accessNote: "borné au périmètre départemental de l'appelant",
    body: createSchema,
    response: "`{ created, truncated }` : nombre d'occurrences créées et indicateur de troncature de la série",
    status: 201,
  },
});
