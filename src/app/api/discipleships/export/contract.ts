import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Export Excel du discipolat",
    description: "Feuille « Statistiques » (présences par disciple sur les événements suivis de la période) et, s'il y a des événements, feuille « Détail présences ».",
    access: "discipleship:export",
    query: z.object({
      churchId: z.string().describe("Église visée"),
      from: z.string().optional().describe("Début de période (date ISO) ; défaut : début du mois courant"),
      to: z.string().optional().describe("Fin de période (date ISO) ; défaut : fin du mois courant"),
    }),
    response: "Classeur Excel du discipolat",
    responseType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
});
