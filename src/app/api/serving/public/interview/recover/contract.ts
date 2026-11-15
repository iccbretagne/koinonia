import { defineContract } from "@/lib/openapi/contract";
import { interviewRecoverSchema } from "@/modules/serving/schemas";

export { interviewRecoverSchema };

export const contract = defineContract({
  POST: {
    summary: "Retrouver mon rendez-vous d'entretien",
    description:
      "Spec 082. Renvoie le lien de rendez-vous à l'adresse email de la fiche, si une candidature à l'étude existe pour cette adresse dans l'église. Turnstile, 3 demandes par minute et par IP. Même réponse que l'adresse soit connue ou non.",
    access: "public",
    body: interviewRecoverSchema,
    response: "`{ ok: true }`",
  },
});
