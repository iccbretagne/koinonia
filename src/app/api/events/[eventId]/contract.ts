import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const updateSchema = z.object({
  title: z.string().min(1, "Le titre est requis"),
  type: z.string().min(1, "Le type est requis"),
  date: z.string().min(1, "La date est requise"),
  planningDeadline: z.string().nullable().optional(),
  applyToSeries: z.boolean().optional(),
  removeFromSeries: z.boolean().optional(),
});

export const patchSchema = z.object({
  allowAnnouncements: z.boolean().optional(),
  trackedForDiscipleship: z.boolean().optional(),
  reportEnabled: z.boolean().optional(),
  statsEnabled: z.boolean().optional(),
  welcomeDutyEnabled: z.boolean().optional(),
  applyToSeries: z.boolean().optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Détail d'un événement",
    access: "events:view",
    accessNote: "dans l'église de l'événement",
    response: "Événement avec ses départements et leur ministère",
  },
  PUT: {
    summary: "Modification d'un événement",
    description: "Avec `removeFromSeries`, détache l'événement de sa série. Avec `applyToSeries`, applique titre, type et heure à toute la série et décale les échéances d'autant. Un changement de date notifie les personnes planifiées. Journalisé.",
    access: "events:manage",
    accessNote: "dans l'église de l'événement",
    body: updateSchema,
    response: "Événement mis à jour avec `notified` (et `seriesUpdated` pour une série)",
  },
  PATCH: {
    summary: "Réglage des options d'un événement",
    description: "Active ou non les annonces, le suivi discipolat, le compte rendu, les statistiques et la permanence d'accueil. Avec `applyToSeries`, s'applique à cet événement et aux suivants de la série. Journalisé.",
    access: "events:manage",
    accessNote: "dans l'église de l'événement",
    body: patchSchema,
    response: "Options de l'événement, ou `{ applied: true }` si appliqué à la série",
  },
  DELETE: {
    summary: "Suppression d'un événement",
    description: "Les personnes planifiées sont notifiées. Journalisé.",
    access: "events:manage",
    accessNote: "dans l'église de l'événement",
    response: "`{ success: true, notified }`",
  },
});
