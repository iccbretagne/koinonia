import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  DELETE: {
    summary: "Retrait d'un berger d'une famille",
    description: "Journalisé.",
    access: "integration:manage",
    accessNote: "ou équipe Intégration/MSDP (accès complet) ; un berger/co-berger au périmètre restreint est refusé",
    response: "`{ deleted: true }`",
  },
});
