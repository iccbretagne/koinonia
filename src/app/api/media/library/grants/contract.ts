import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

const futureOrNull = z.string().datetime({ offset: true }).nullable().describe("Date de fin (future) ou `null` : sans date de fin");

export const createGrantSchema = z.object({
  userId: z.string().min(1),
  expiresAt: futureOrNull.default(null),
});

export const contract = defineContract({
  GET: {
    summary: "Galerie médias : accès nominatifs de l'église",
    access: "media:manage",
    accessNote: "Admin de l'église, ou Ministre d'un ministère qui porte une équipe Photos, Production Média ou Communication (spec 080)",
    response: "Liste des accès (personne, date de fin, expiré ou non, accordé par)",
  },
  POST: {
    summary: "Galerie médias : donner (ou prolonger) un accès nominatif",
    description: "Le compte doit avoir un rôle dans l'église (400 sinon) ; date de fin future ou absente (400 sinon). La personne est notifiée à l'ouverture de l'accès. Journalisé.",
    access: "media:manage",
    accessNote: "Admin de l'église, ou Ministre d'un ministère qui porte une équipe média (spec 080)",
    body: createGrantSchema,
    status: 201,
    response: "Accès créé ou mis à jour",
  },
});
