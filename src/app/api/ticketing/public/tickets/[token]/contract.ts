import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Billet individuel",
    description:
      "Jeton de billet dans l'adresse : ce billet seul (nom, tranche d'âge, événement, validité, contenu du QR), sans les autres participants, les paiements ni aucun droit de modification. Jeton inconnu → 404.",
    access: "token",
    response: "Billet",
  },
});
