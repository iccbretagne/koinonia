import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Historique d'une demande d'intégration",
    description: "Changements d'état affichés sur la fiche (spec 051).",
    access: "integration:manage",
    accessNote: "ou équipe Intégration/MSDP ; un berger/co-berger n'accède qu'aux demandes de ses familles (403 sinon)",
    response: "`{ entries }` : historique des changements d'état",
  },
});
