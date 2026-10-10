import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const patchSchema = z.object({
  status: z.enum([
    "PENDING", "APPROVED", "REJECTED", "PREVALIDATED", "PREREJECTED",
    "DRAFT", "IN_REVIEW", "REVISION_REQUESTED", "FINAL_APPROVED",
  ]).optional(),
  filename: z.string().min(1).optional(),
  // Confirm upload: signal that presigned upload completed (key is derived server-side)
  confirmUpload: z.boolean().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().int().positive().optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Détail d'un fichier média",
    access: "media:view",
    accessNote: "dans l'église du conteneur du fichier (événement média : activité Photos ; projet : activité Visuels) ; ou équipe de l'activité, ou membre de la Communication (lecture)",
    response: "Fichier avec ses versions (la plus récente d'abord) et le nombre de commentaires",
  },
  PATCH: {
    summary: "Mise à jour d'un fichier média",
    description: "Permet de changer le statut, le nom ou les dimensions, et de confirmer un dépôt présigné (`confirmUpload`) : la taille réelle de l'objet déposé est alors contrôlée (404 si absent, 400 si trop lourd, objet supprimé) avant de créer la version 1 et de passer le fichier en `IN_REVIEW` (spec 029). Poser `APPROVED`, `REJECTED` ou `FINAL_APPROVED` exige en plus `media:review`. Le créateur du projet est notifié d'un changement de statut, sauf s'il en est l'auteur.",
    access: "media:upload",
    accessNote: "dans l'église du conteneur du fichier ; ou équipe de l'activité, ou membre de la Communication ; `media:review` (ou équipe de l'activité) pour approuver, refuser ou valider définitivement",
    body: patchSchema,
    response: "Fichier média mis à jour",
  },
  DELETE: {
    summary: "Suppression d'un fichier média",
    description: "Supprime aussi les objets de stockage de toutes ses versions.",
    access: "media:manage",
    accessNote: "dans l'église du conteneur du fichier ; ou équipe de l'activité (pas la Communication)",
    response: "`{ deleted: id }`",
  },
});
