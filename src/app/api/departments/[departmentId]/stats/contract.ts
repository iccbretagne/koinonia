import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Statistiques de service d'un département",
    description: "Services et indisponibilités par STAR, taux de service, tendance mensuelle et répartition des tâches. Période : `from`/`to` explicites, sinon les `months` derniers mois (6 par défaut).",
    access: "planning:department",
    accessNote: "borné au périmètre départemental de l'appelant",
    query: z.object({
      months: z.string().optional().describe("Nombre de mois à remonter (6 par défaut)"),
      from: z.string().optional().describe("Début de période (date ISO) ; prioritaire sur `months`"),
      to: z.string().optional().describe("Fin de période (date ISO), avec `from`"),
    }),
    response: "Département, nombre d'événements, STAR (services, indisponibilités, taux), tendance mensuelle et statistiques de tâches",
  },
});
