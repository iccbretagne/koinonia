import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const createSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  churchId: z.string().min(1, "L'église est requise"),
  description: z.string().nullable().optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Projets médias d'une église",
    access: "media:view",
    accessNote: "dans l'église visée ; ou équipe Production Média, ou membre de la Communication (lecture)",
    query: z.object({ churchId: z.string().describe("Église visée") }),
    response: "Liste des projets, du plus récent au plus ancien, avec créateur et compteurs",
  },
  POST: {
    summary: "Création d'un projet média",
    description: "Journalisé.",
    access: "media:upload",
    accessNote: "dans l'église indiquée dans le corps ; ou équipe Production Média, ou membre de la Communication",
    body: createSchema,
    response: "Projet créé, créateur inclus",
    status: 201,
  },
});
