import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Export Excel des statistiques des cultes",
    description: "Une ligne par compte rendu de la période (mois courant par défaut) : fréquentation, nouveaux arrivants, Sainte Cène et navette, extraites des sections du compte rendu.",
    access: "reports:view",
    query: z.object({
      churchId: z.string().describe("Église visée (requis)"),
      from: z.string().optional().describe("Début de période (ISO), par défaut le 1er du mois"),
      to: z.string().optional().describe("Fin de période (ISO), par défaut la fin du mois"),
    }),
    response: "Classeur Excel « Statistiques cultes »",
    responseType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
});
