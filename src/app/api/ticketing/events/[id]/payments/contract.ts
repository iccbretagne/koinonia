import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Règlements d'un événement",
    description: "Déclarations, encaissements et remboursements, du plus récent au plus ancien.",
    access: "session",
    accessNote: "organisateur ou trésorier de l'événement",
    response: "Liste des paiements",
  },
});
