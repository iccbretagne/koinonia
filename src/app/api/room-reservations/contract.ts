import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const createSchema = z
  .object({
    churchId: z.string().min(1),
    roomId: z.string().min(1),
    eventId: z.string().min(1).optional(),
    title: z.string().min(1).max(200),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    recurrenceRule: z.enum(["weekly", "biweekly", "monthly"]).optional(),
    recurrenceEnd: z.string().datetime().optional(),
  })
  .refine((d) => new Date(d.endAt) > new Date(d.startAt), {
    message: "endAt doit être postérieure à startAt",
    path: ["endAt"],
  })
  .refine((d) => !d.recurrenceRule || d.recurrenceEnd, {
    message: "recurrenceEnd requis avec recurrenceRule",
    path: ["recurrenceEnd"],
  });

export const contract = defineContract({
  GET: {
    summary: "Réservations de salles",
    description: "Sans `roomId` : historique des réservations de l'église. Avec `roomId` : occupation de la salle toutes églises confondues (pour la disponibilité), détails masqués (« Réservé ») pour les réservations d'une autre église ; 403 si l'église n'est pas autorisée sur la salle.",
    access: "rooms:view",
    query: z.object({
      churchId: z.string().describe("Église appelante"),
      roomId: z.string().optional().describe("Salle dont on veut l'occupation"),
      from: z.string().optional().describe("Début de période (date ISO)"),
      to: z.string().optional().describe("Fin de période (date ISO)"),
    }),
    response: "`{ reservations }` : historique de l'église (salle, état de la main courante) ou occupation de la salle",
  },
  POST: {
    summary: "Réservation d'une salle",
    description: "Occurrence unique ou série récurrente (`recurrenceRule` + `recurrenceEnd`). 409 si aucun créneau n'est libre ; les occurrences en conflit sont renvoyées dans `conflicts`, la série peut être tronquée (`truncated`). Journalisé.",
    access: "rooms:reserve",
    body: createSchema,
    response: "`{ reservations, conflicts, truncated }`",
    status: 201,
  },
});
