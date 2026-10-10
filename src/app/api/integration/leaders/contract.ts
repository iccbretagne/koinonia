import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const createSchema = z.object({
  churchId: z.string().min(1),
  userId: z.string().min(1),
  familyId: z.number().int().positive(),
  familyName: z.string().min(1).max(100),
  role: z.enum(["BERGER", "CO_BERGER"]),
});

export const contract = defineContract({
  GET: {
    summary: "Liste des bergers et co-bergers",
    access: "integration:manage",
    accessNote: "ou équipe Intégration/MSDP, ou berger/co-berger",
    query: z.object({
      churchId: z.string().describe("Église visée"),
      familyId: z.string().optional().describe("Restreint à une famille"),
    }),
    response: "Affectations triées par famille puis rôle, avec l'utilisateur",
  },
  POST: {
    summary: "Affectation d'un berger à une famille",
    description: "L'utilisateur doit avoir un rôle dans l'église (400 sinon). Journalisé.",
    access: "integration:manage",
    accessNote: "ou équipe Intégration/MSDP, ou berger/co-berger (la garde n'exige pas l'accès complet)",
    body: createSchema,
    status: 201,
    response: "Affectation créée, avec l'utilisateur",
  },
});
