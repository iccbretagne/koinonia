import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const sectionSchema = z.object({
  id: z.string().optional(),
  departmentId: z.string().nullable().optional(),
  label: z.string().min(1),
  position: z.number().int().default(0),
  stats: z.record(z.string(), z.number().int().nullable()).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const upsertSchema = z.object({
  speaker: z.string().nullable().optional(),
  messageTitle: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  decisions: z.string().nullable().optional(),
  sections: z.array(sectionSchema),
});

export const contract = defineContract({
  GET: {
    summary: "Compte rendu d'un événement",
    access: "reports:view",
    accessNote: "ou `events:manage`, dans l'église de l'événement",
    response: "Compte rendu avec sections et auteur, ou null s'il n'existe pas",
  },
  PUT: {
    summary: "Saisie du compte rendu d'un événement",
    description: "Crée ou remplace le compte rendu complet et ses sections. 403 si les comptes rendus ne sont pas activés pour l'événement ; 400 si un département n'appartient pas à l'église. Journalisé.",
    access: "reports:edit",
    accessNote: "ou `events:manage`, dans l'église de l'événement",
    body: upsertSchema,
    response: "Compte rendu enregistré, sections et auteur inclus",
  },
});
