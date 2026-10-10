import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const patchSchema = z.object({
  name: z.string().min(1).optional(),
  date: z.string().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "PENDING_REVIEW", "REVIEWED", "ARCHIVED"]).optional(),
  planningEventId: z.string().nullable().optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Détail d'un événement média",
    access: "media:view",
    accessNote: "dans l'église de l'événement ; ou équipe Photos, ou membre de la Communication (lecture)",
    response: "Événement avec église, créateur, événement de planning lié, liens de partage, statuts des photos et compteurs",
  },
  PATCH: {
    summary: "Modification d'un événement média",
    description: "L'événement de planning lié doit appartenir à la même église (400 sinon). Journalisé.",
    access: "media:upload",
    accessNote: "dans l'église de l'événement ; ou équipe Photos, ou membre de la Communication",
    body: patchSchema,
    response: "Événement média mis à jour",
  },
  DELETE: {
    summary: "Suppression d'un événement média",
    description: "Supprime aussi les objets de stockage de ses photos et fichiers ; ses photos, fichiers et liens de partage sont supprimés en cascade. Journalisé.",
    access: "media:manage",
    accessNote: "dans l'église de l'événement ; ou équipe Photos (pas la Communication)",
    response: "`{ deleted: id }`",
  },
});
