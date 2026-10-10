import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const bulkSchema = z.object({
  ids: z.array(z.string()).min(1, "Au moins un ID requis"),
  action: z.enum(["delete", "update"]),
  data: z.object({
    name: z.string().min(1).optional(),
    churchId: z.string().min(1).optional(),
  }).optional(),
});

export const createSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  churchId: z.string().min(1, "L'église est requise"),
});

export const contract = defineContract({
  GET: {
    summary: "Liste des ministères d'une église",
    access: "departments:view",
    query: z.object({ churchId: z.string().describe("Église visée") }),
    response: "Ministères avec leur église, triés par nom",
  },
  POST: {
    summary: "Création d'un ministère",
    description: "Journalisé.",
    access: "departments:manage",
    body: createSchema,
    response: "Ministère créé, avec son église",
    status: 201,
  },
  PATCH: {
    summary: "Action groupée sur des ministères",
    description: "`delete` supprime les ministères en cascade (départements, planning, appartenances, STAR rattachés uniquement à ces départements) et détache les rôles `ministryId` concernés ; `update` modifie le nom. Tous les ministères doivent appartenir à la même église (400 sinon) ; déplacer un ministère vers une autre église est refusé (403). Journalisé par ministère.",
    access: "departments:manage",
    body: bulkSchema,
    response: "`{ deleted: n }` ou `{ updated: n }` selon l'action",
  },
});
