import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const createSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  description: z.string().optional(),
});

export const deleteSchema = z.object({ taskId: z.string().describe("Tâche à supprimer") });

export const contract = defineContract({
  GET: {
    summary: "Liste des tâches d'un département",
    access: "planning:department",
    accessNote: "borné au périmètre départemental de l'appelant",
    response: "Tâches du département, de la plus ancienne à la plus récente",
  },
  POST: {
    summary: "Création d'une tâche de département",
    description: "409 si une tâche du même nom existe déjà dans le département. Journalisé.",
    access: "planning:edit",
    accessNote: "borné au périmètre départemental de l'appelant",
    body: createSchema,
    response: "Tâche créée",
    status: 201,
  },
  DELETE: {
    summary: "Suppression d'une tâche de département",
    description: "404 si la tâche n'appartient pas au département. Journalisé.",
    access: "planning:edit",
    accessNote: "borné au périmètre départemental de l'appelant",
    body: deleteSchema,
    response: "`{ success: true }`",
  },
});
