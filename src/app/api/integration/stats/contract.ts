import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Statistiques des demandes d'intégration",
    description: "Demandes non archivées. Un berger/co-berger voit les chiffres de ses seules familles.",
    access: "integration:manage",
    accessNote: "ou équipe Intégration/MSDP (périmètre complet), ou berger/co-berger (ses familles)",
    query: z.object({ churchId: z.string().describe("Église visée") }),
    response:
      "Totaux (en cours, intégrées, abandonnées), taux de conversion, délai moyen d'intégration, répartitions par statut, famille (10 premières), tranche d'âge, statut d'église, motif d'abandon, tendance sur 12 mois et nombre de soins pastoraux demandés",
  },
});
