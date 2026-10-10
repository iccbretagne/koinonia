import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const createSchema = z.object({
  churchId: z.string().min(1),
  name: z.string().min(1).max(200),
  capacity: z.number().int().positive().optional(),
  location: z.string().max(200).optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Liste des salles d'une église",
    description: "Salles possédées par l'église et salles partagées avec elle.",
    access: "rooms:view",
    query: z.object({ churchId: z.string().describe("Église visée") }),
    response: "`{ rooms }` : salles triées par nom, avec `isOwner` et l'église propriétaire",
  },
  POST: {
    summary: "Création d'une salle",
    description: "La salle appartient à l'église indiquée. Journalisé.",
    access: "rooms:manage",
    body: createSchema,
    response: "Salle créée",
    status: 201,
  },
});
