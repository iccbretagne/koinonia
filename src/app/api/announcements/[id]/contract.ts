import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const patchSchema = z.object({
  status: z
    .enum(["EN_ATTENTE", "EN_COURS", "TRAITEE", "ANNULEE"])
    .optional(),
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  isUrgent: z.boolean().optional(),
  isSaveTheDate: z.boolean().optional(),
  eventDate: z.string().nullable().optional(),
  channelInterne: z.boolean().optional(),
  channelExterne: z.boolean().optional(),
  targetEventIds: z.array(z.string()).optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Détail d'une annonce",
    access: "members:view",
    accessNote: "auteur, ou `events:manage` dans l'église de l'annonce",
    response: "Annonce avec ses demandes liées",
  },
  PATCH: {
    summary: "Modification d'une annonce",
    description: "Un gestionnaire change n'importe quel statut ; l'auteur peut seulement annuler. L'annulation se propage aux demandes liées. Journalisé.",
    access: "members:view",
    accessNote: "auteur, ou `events:manage` dans l'église de l'annonce",
    body: patchSchema,
    response: "Annonce mise à jour",
  },
  DELETE: {
    summary: "Suppression d'une annonce",
    description: "Journalisé.",
    access: "members:view",
    accessNote: "auteur, ou `events:manage` dans l'église de l'annonce",
    response: "`{ deleted: id }`",
  },
});
