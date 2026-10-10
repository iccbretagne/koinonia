import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  DELETE: {
    summary: "Retrait d'un berger d'une famille",
    description: "Journalisé.",
    access: "integration:manage",
    accessNote: "ou équipe Intégration/MSDP, ou berger/co-berger (la garde n'exige pas l'accès complet)",
    response: "`{ deleted: true }`",
  },
});
