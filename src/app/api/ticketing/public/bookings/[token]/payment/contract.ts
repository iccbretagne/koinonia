import { defineContract } from "@/lib/openapi/contract";
import { declarePaymentSchema } from "@/modules/ticketing/schemas";

export { declarePaymentSchema };

export const contract = defineContract({
  POST: {
    summary: "« J'ai payé »",
    description:
      "Les éléments à régler passent à déclaré avec le moyen indiqué (Wero, Revolut, virement) ; le trésorier est prévenu. 409 s'il n'y a rien à régler.",
    access: "token",
    body: declarePaymentSchema,
    status: 201,
    response: "Déclaration enregistrée",
  },
});
