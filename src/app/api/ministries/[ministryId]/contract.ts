import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const updateSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
});

export const contract = defineContract({
  PUT: {
    summary: "Modification d'un ministère",
    description: "Un ministère système n'est modifiable que par un Super Admin. Journalisé.",
    access: "departments:manage",
    body: updateSchema,
    response: "Ministère mis à jour, avec son église",
  },
  DELETE: {
    summary: "Suppression d'un ministère",
    description: "Refusée (400) si le ministère contient encore des départements. Un ministère système n'est supprimable que par un Super Admin. Journalisé.",
    access: "departments:manage",
    response: "`{ success: true }`",
  },
});
