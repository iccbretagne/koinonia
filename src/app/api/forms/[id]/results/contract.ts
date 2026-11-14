import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Résultats regroupés d'un formulaire",
    description:
      "Un agrégat par question sur les réponses confirmées : effectifs par choix (places comprises), oui/non, note moyenne et répartition, somme et moyenne d'un nombre, textes libres triés (jamais dans l'ordre d'arrivée), emails et téléphones seulement comptés. Participation : personnes qui viennent, accompagnants, total. Aucune identité, sondage anonyme ou non. Un intervenant n'a que son périmètre.",
    access: "forms:manage",
    accessNote: "dans l'église du formulaire, ou intervenant désigné tant que le formulaire n'est pas clôturé",
    response: "Résultats par question et résumé de participation",
  },
});
