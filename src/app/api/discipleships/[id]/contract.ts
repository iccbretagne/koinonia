import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const updateSchema = z.object({
  discipleMakerId: z.string(),
  firstMakerId: z.string().optional(),
});

export const contract = defineContract({
  PATCH: {
    summary: "Changement de FD d'une relation de discipolat",
    description: "Le FD actuel est remplacé et la date de début remise à maintenant. Le premier FD ne peut être changé que hors périmètre restreint. Refus 400 si un STAR devenait son propre FD ou si un membre n'appartient pas à l'église. Journalisé.",
    access: "discipleship:manage",
    accessNote: "dans l'église de la relation ; un Faiseur de Disciples ne modifie que ses propres disciples et jamais le premier FD (403)",
    body: updateSchema,
    response: "Relation mise à jour, avec disciple, FD actuel et premier FD",
  },
  DELETE: {
    summary: "Détachement d'un disciple de son FD",
    description: "Supprime la relation de discipolat. Journalisé.",
    access: "discipleship:manage",
    accessNote: "dans l'église de la relation ; un Faiseur de Disciples ne détache que ses propres disciples (403)",
    response: "`{ deleted: true }`",
  },
});
