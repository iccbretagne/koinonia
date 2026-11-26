import { defineContract } from "@/lib/openapi/contract";
import { reviewSchema } from "@/modules/campaigns/schemas";

export { reviewSchema };

export const contract = defineContract({
  POST: {
    summary: "Demande de correction ou validation d'un questionnaire",
    description:
      "Spec 090. `request_changes` (motif obligatoire) : soumis ou validé → « Correction demandée », modifiable de nouveau, campagne ouverte requise (409 sinon), répondants prévenus. `validate` : soumis → « Validé », `pastoralValidated` consigne « Validé par la Pasteure ». Autre état : 409. Journalisé.",
    access: "session",
    accessNote: "gestionnaire de la campagne",
    body: reviewSchema,
    response: "`{ status }` (et `pastoralValidated` à la validation)",
  },
});
