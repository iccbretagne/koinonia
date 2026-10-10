import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

function isValidDate(val: string) {
  return !Number.isNaN(new Date(val).getTime());
}

export const bulkSchema = z.object({
  ids: z.array(z.string()).min(1, "Au moins un ID requis"),
  action: z.enum(["delete", "update"]),
  data: z.object({
    title: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
    date: z.string().min(1).optional(),
  }).optional(),
});

export const createSchema = z.object({
  title: z.string().min(1, "Le titre est requis"),
  type: z.string().min(1, "Le type est requis"),
  date: z.string().min(1, "La date est requise").refine(isValidDate, "Date invalide"),
  churchId: z.string().min(1, "L'église est requise"),
  planningDeadline: z.string().nullable().optional().refine(
    (v) => v == null || isValidDate(v),
    "Date limite invalide"
  ),
  deadlineOffset: z.string().nullable().optional(),
  recurrenceRule: z.enum(["weekly", "biweekly", "monthly"]).nullable().optional(),
  recurrenceEnd: z.string().nullable().optional().refine(
    (v) => v == null || isValidDate(v),
    "Date de fin de récurrence invalide"
  ),
});

export const contract = defineContract({
  GET: {
    summary: "Liste des événements d'une église",
    description: "Triés par date décroissante (croissante avec `trackedForDiscipleship`).",
    access: "events:view",
    query: z.object({
      churchId: z.string().describe("Église visée (requis)"),
      trackedForDiscipleship: z.string().optional().describe("`true` pour ne garder que les événements suivis pour le discipolat"),
      from: z.string().optional().describe("Date minimale (ISO) des événements"),
    }),
    response: "Liste des événements, église et départements inclus",
  },
  POST: {
    summary: "Création d'un événement",
    description: "Avec une règle de récurrence et une date de fin, crée l'événement parent et ses occurrences (plafonnées, `recurrenceTruncated` signale la troncature). Journalisé.",
    access: "events:manage",
    body: createSchema,
    status: 201,
    response: "Événement créé, église et départements inclus ; `childrenCreated` pour une série",
  },
  PATCH: {
    summary: "Suppression ou modification groupée d'événements",
    description: "Tous les identifiants doivent appartenir à la même église. Un déplacement de date ou une suppression notifie les personnes planifiées. Journalisé.",
    access: "events:manage",
    accessNote: "dans l'église des événements visés",
    body: bulkSchema,
    response: "`{ deleted, notified }` pour `delete`, `{ updated, notified }` pour `update`",
  },
});
