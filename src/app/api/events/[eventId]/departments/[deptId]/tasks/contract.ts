import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const assignSchema = z.object({
  taskId: z.string(),
  memberIds: z.array(z.string()),
});

export const contract = defineContract({
  GET: {
    summary: "Tâches d'un département pour un événement",
    description: "404 si le département n'est pas lié à l'événement.",
    access: "planning:department",
    accessNote: "borné au périmètre départemental",
    response: "Tâches du département avec les STAR qui leur sont affectés pour cet événement",
  },
  PUT: {
    summary: "Affectation des STAR à une tâche",
    description: "Remplace les affectations de la tâche pour l'événement. Chaque STAR doit être en service (`EN_SERVICE` ou `EN_SERVICE_DEBRIEF`), sinon 400. Journalisé.",
    access: "planning:edit",
    accessNote: "borné au périmètre départemental",
    body: assignSchema,
    response: "Tâche mise à jour avec ses affectations pour l'événement",
  },
});
