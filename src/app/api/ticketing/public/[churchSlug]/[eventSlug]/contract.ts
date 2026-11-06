import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Page publique d'un événement",
    description:
      "Événement ouvert ou clos aux inscriptions seulement (brouillon et clôturé : 404, même réponse qu'une adresse inconnue). Tarifs, options et plats ouverts avec le stock restant, places restantes, questions, moyens de paiement proposés (sans coordonnées), raison de fermeture le cas échéant.",
    access: "public",
    response: "Événement public",
  },
});
