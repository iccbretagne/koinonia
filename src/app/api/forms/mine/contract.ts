import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Mes réponses ouvertes",
    description: "Réponses du compte connecté aux formulaires publiés (hors sondages anonymes, qui ne gardent aucun lien avec le compte).",
    access: "session",
    response: "Réponses avec leur formulaire et son adresse",
  },
});
