import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Statistiques de participation du discipolat",
    description: "Taux de présence de chaque disciple aux événements suivis de la période.",
    access: "discipleship:view",
    accessNote: "un Faiseur de Disciples ne voit que ses propres disciples",
    query: z.object({
      churchId: z.string().describe("Église visée"),
      from: z.string().optional().describe("Début de période (date ISO) ; défaut : début du mois courant"),
      to: z.string().optional().describe("Fin de période (date ISO) ; défaut : fin du mois courant"),
    }),
    response: "`{ period, trackedEvents, stats }` ; `stats` donne par disciple le total d'événements, présences, absences et taux (%)",
  },
});
