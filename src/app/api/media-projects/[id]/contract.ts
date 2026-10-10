import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Détail d'un projet média",
    access: "media:view",
    accessNote: "dans l'église du projet ; ou équipe Production Média, ou membre de la Communication (lecture)",
    response: "Projet avec créateur, fichiers (dernière version et URL de miniature signée), liens de partage et compteurs",
  },
  PATCH: {
    summary: "Modification d'un projet média",
    description: "Journalisé.",
    access: "media:upload",
    accessNote: "dans l'église du projet ; ou équipe Production Média, ou membre de la Communication",
    body: patchSchema,
    response: "Projet mis à jour",
  },
  DELETE: {
    summary: "Suppression d'un projet média",
    description: "Supprime aussi les objets de stockage de tous ses fichiers et versions. Journalisé.",
    access: "media:manage",
    accessNote: "dans l'église du projet ; ou équipe Production Média (pas la Communication)",
    response: "`{ deleted: id }`",
  },
});
