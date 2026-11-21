import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Demandes de domaines dédiés (toutes églises)",
    description: "Écran d'approbation : église, événement, domaine, état et dernier contrôle DNS.",
    access: "superAdmin",
    response: "Liste des domaines",
  },
});
