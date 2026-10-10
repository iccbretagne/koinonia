import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const createSchema = z.union([
  z.object({
    discipleId: z.string(),
    discipleMakerId: z.string(),
    churchId: z.string(),
    firstMakerId: z.string().optional(),
  }),
  z.object({
    newMember: z.object({
      firstName: z.string().min(1, "Le prénom est requis"),
      lastName: z.string().min(1, "Le nom est requis"),
    }),
    discipleMakerId: z.string(),
    churchId: z.string(),
    firstMakerId: z.string().optional(),
  }),
]);

export const contract = defineContract({
  GET: {
    summary: "Liste des relations de discipolat",
    access: "discipleship:view",
    accessNote: "un Faiseur de Disciples ne voit que ses propres disciples",
    query: z.object({ churchId: z.string().describe("Église visée") }),
    response: "Relations triées par FD puis disciple, avec disciple (département principal inclus), FD actuel et premier FD",
  },
  POST: {
    summary: "Création d'une relation de discipolat",
    description:
      "Le disciple est un STAR existant (`discipleId`) ou une nouvelle fiche créée à la volée (`newMember`, rattachée au département système de l'église). " +
      "Refus 400 si le disciple est son propre FD ou si un membre n'appartient pas à l'église, 409 si le disciple a déjà un FD dans l'église. " +
      "Le premier FD vaut le FD actuel par défaut. Journalisé ; limité en débit par utilisateur.",
    access: "discipleship:manage",
    accessNote: "un Faiseur de Disciples ne peut créer que des relations dont il est le FD (403 sinon)",
    body: createSchema,
    status: 201,
    response: "Relation créée, avec disciple et FD",
  },
});
