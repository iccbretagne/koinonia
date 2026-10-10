import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const schema = z.object({
  churchId: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});

export const contract = defineContract({
  GET: {
    summary: "Mois de collecte des disponibilités",
    access: "availability:settings",
    query: z.object({
      churchId: z.string(),
    }),
    response: "Mois ouverts ou planifiés pour la collecte",
  },
  POST: {
    summary: "Ouverture d'une collecte de disponibilités",
    description: "Journalisé.",
    access: "availability:settings",
    body: schema,
    status: 201,
    response: "Collecte ouverte",
  },
});
