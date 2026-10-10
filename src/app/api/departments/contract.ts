import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const bulkSchema = z.object({
  ids: z.array(z.string()).min(1, "Au moins un ID requis"),
  action: z.enum(["delete", "update"]),
  data: z.object({
    name: z.string().min(1).optional(),
    ministryId: z.string().min(1).optional(),
  }).optional(),
});

export const createSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  ministryId: z.string().min(1, "Le ministère est requis"),
});

export const contract = defineContract({
  GET: {
    summary: "Liste des départements d'une église",
    access: "departments:view",
    query: z.object({
      churchId: z.string().describe("Église visée"),
      ministryId: z.string().optional().describe("Restreint la liste à un ministère"),
    }),
    response: "Départements avec leur ministère, triés par ministère puis par nom",
  },
  POST: {
    summary: "Création d'un département",
    description: "L'église est déduite du ministère cible. Journalisé.",
    access: "departments:manage",
    accessNote: "dans l'église du ministère ; un Ministre ne peut créer un département que dans son propre ministère",
    body: createSchema,
    response: "Département créé, avec son ministère",
    status: 201,
  },
  PATCH: {
    summary: "Action groupée sur des départements",
    description: "`delete` supprime les départements avec leur planning, appartenances et rattachements ; `update` modifie le nom ou le ministère. Tous les départements doivent appartenir à la même église (400 sinon) et le ministère cible être de cette église. Journalisé par département.",
    access: "departments:manage",
    accessNote: "dans l'église des départements ; un Ministre est borné aux départements de son ministère",
    body: bulkSchema,
    response: "`{ deleted: n }` ou `{ updated: n }` selon l'action",
  },
});
