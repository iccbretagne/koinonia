import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const createSchema = z
  .object({
    churchId: z.string().min(1, "L'église est requise"),
    title: z.string().min(1, "Le titre est requis"),
    content: z.string().min(1, "Le contenu est requis"),
    eventDate: z.string().nullable().optional(),
    channelInterne: z.boolean().default(false),
    channelExterne: z.boolean().default(false),
    isUrgent: z.boolean().default(false),
    departmentId: z.string().nullable().optional(),
    ministryId: z.string().nullable().optional(),
    targetEventIds: z.array(z.string()).default([]),
  })
  .refine((d) => d.channelInterne || d.channelExterne, {
    message: "Au moins un canal de diffusion est requis",
  });

export const contract = defineContract({
  GET: {
    summary: "Liste des annonces",
    access: "members:view",
    accessNote: "Avec `events:manage`, toutes les annonces de l'église ; sinon celles de l'appelant",
    query: z.object({
      churchId: z.string(),
    }),
    response: "Annonces avec leurs demandes de diffusion et de visuel",
  },
  POST: {
    summary: "Création d'une annonce",
    description: "Département, ministère et événements visés doivent être de l'église. Chaque canal demandé (diffusion interne, réseaux sociaux) crée une demande de diffusion et sa demande de visuel enfant ; il exige que le département qui le traite (Secrétariat, Communication) soit configuré, sinon 400. Journalisé.",
    access: "members:view",
    body: createSchema,
    status: 201,
    response: "Annonce créée",
  },
});
