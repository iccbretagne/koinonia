import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const createSchema = z.object({
  eventId:            z.string().min(1),
  welcomeDutyFamilyId: z.string().min(1),
  note:               z.string().max(500).optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Affectations de permanence d'accueil",
    description: "Par événement, ou par période à partir de `from` ; 400 si ni `eventId` ni `from` n'est fourni.",
    access: "events:manage",
    accessNote: "dans l'église courante",
    query: z.object({
      eventId: z.string().optional().describe("Événement visé"),
      from: z.string().optional().describe("Date de début (ISO) ; requis sans `eventId`"),
      to: z.string().optional().describe("Date de fin (ISO)"),
    }),
    response: "Liste des affectations avec la famille",
  },
  POST: {
    summary: "Affectation d'une famille à une permanence d'accueil",
    description: "L'événement doit appartenir à l'église courante et la famille être active dans le pool (404 sinon).",
    access: "events:manage",
    accessNote: "dans l'église courante",
    body: createSchema,
    status: 201,
    response: "Affectation créée, famille incluse",
  },
});
