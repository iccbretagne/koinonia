import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Préparer l'ouverture d'une campagne",
    description:
      "Spec 091. Synthèse en lecture seule : questionnaires, questions, définition valide, échéances non dépassées, destinataires, répondants valides, contrôles de cohérence, questionnaires confidentiels (informatif). Aucun nom de personne.",
    access: "campaigns:manage",
    accessNote: "dans l'église de la campagne, ou gestionnaire désigné ; sinon 404",
    response: "`{ ready, items: { key, label, ok, detail? }[] }`",
  },
});
