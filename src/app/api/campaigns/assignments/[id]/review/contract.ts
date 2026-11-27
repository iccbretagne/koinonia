import { defineContract } from "@/lib/openapi/contract";
import { reviewSchema } from "@/modules/campaigns/schemas";

export { reviewSchema };

export const contract = defineContract({
  POST: {
    summary: "Revue d'un questionnaire : correction, validation, réouverture, annulation de validation",
    description:
      "Spec 090. `request_changes` (motif obligatoire) : soumis ou validé → « Correction demandée », modifiable de nouveau, campagne ouverte requise (409 sinon), répondants prévenus. `validate` : soumis → « Validé », `pastoralValidated` consigne « Validé par la Pasteure ». Spec 091 — `reopen` (motif facultatif) : soumis → « En cours », campagne ouverte requise, réponses et fichiers conservés, nouvelle soumission nécessaire, répondants prévenus sans le motif. `unvalidate` (motif facultatif) : validé → « Soumis », mention pastorale retirée, sans notification. Autre état : 409. Journalisé.",
    access: "session",
    accessNote: "gestionnaire de la campagne",
    body: reviewSchema,
    response: "`{ status }` (et `pastoralValidated` à la validation et à son annulation)",
  },
});
