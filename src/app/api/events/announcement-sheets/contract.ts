import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Événements à venir avec leur feuille d'annonces",
    description: "Par défaut à partir de maintenant, triés par date croissante.",
    access: "planning:view",
    accessNote: "dans l'église courante, et droit de lecture des feuilles d'annonces (403 sinon)",
    query: z.object({
      from: z.string().optional().describe("Date de début (ISO), par défaut maintenant"),
      to: z.string().optional().describe("Date de fin (ISO)"),
    }),
    response: "Liste de `{ event, sheet }` ; `sheet` vaut null sans feuille déposée",
  },
});
