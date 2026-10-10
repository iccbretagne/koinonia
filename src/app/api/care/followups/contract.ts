import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const startSchema = z.object({
  churchId: z.string().min(1),
  integrationRequestId: z.string().min(1),
});

export const contract = defineContract({
  GET: {
    summary: "Suivis de nouveaux convertis (MSDP)",
    access: "session",
    accessNote: "vue complète pour l'équipe de gestion (`care:view`/`care:qualify`, équipe MSDP) ; sinon les suivis dont on est l'accompagnant",
    query: z.object({
      churchId: z.string(),
    }),
    response: "Suivis MSDP",
  },
  POST: {
    summary: "Création d'un suivi MSDP",
    description: "Journalisé.",
    access: "session",
    accessNote: "équipe intégration ou MSDP de l'église",
    body: startSchema,
    status: 201,
    response: "Suivi créé",
  },
});
