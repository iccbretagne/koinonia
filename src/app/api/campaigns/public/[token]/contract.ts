import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Questionnaire ouvert par un lien personnel",
    description:
      "Spec 090. Répondant sans compte : n'ouvre que son questionnaire, tant que la campagne est ouverte. Lien inconnu, révoqué, régénéré, campagne en brouillon ou clôturée : même 404. Débit limité par IP.",
    access: "token",
    response: "Vue du questionnaire et de sa saisie (comme `GET /api/campaigns/assignments/{id}`)",
  },
});
