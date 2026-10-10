import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const createSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  date: z.string().min(1, "La date est requise"),
  churchId: z.string().min(1, "L'église est requise"),
  description: z.string().nullable().optional(),
  planningEventId: z.string().nullable().optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Événements médias d'une église",
    access: "media:view",
    accessNote: "dans l'église visée ; ou équipe Photos, ou membre de la Communication (lecture)",
    query: z.object({
      churchId: z.string().describe("Église visée"),
      status: z.enum(["DRAFT", "PENDING_REVIEW", "REVIEWED", "ARCHIVED"]).optional().describe("Filtre sur le statut"),
      from: z.string().optional().describe("Date de début (incluse)"),
      to: z.string().optional().describe("Date de fin (incluse)"),
    }),
    response: "Liste des événements, du plus récent au plus ancien, avec église, créateur, événement de planning lié et compteurs",
  },
  POST: {
    summary: "Création d'un événement média",
    description: "L'événement de planning lié doit appartenir à la même église (400 sinon). Journalisé.",
    access: "media:upload",
    accessNote: "dans l'église indiquée dans le corps ; ou équipe Photos, ou membre de la Communication",
    body: createSchema,
    response: "Événement média créé",
    status: 201,
  },
});
