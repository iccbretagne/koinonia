import { defineContract } from "@/lib/openapi/contract";
import { paymentActionSchema } from "@/modules/ticketing/schemas";

export { paymentActionSchema };

export const contract = defineContract({
  PATCH: {
    summary: "Confirmation ou refus d'un paiement déclaré",
    description:
      "`confirm` : les éléments déclarés passent à payé (un élément annulé entre-temps passe à « à rembourser »). `reject` avec motif : ils repassent à régler. Le contact est prévenu. 409 si la déclaration est déjà traitée.",
    access: "session",
    accessNote: "organisateur ou trésorier de l'événement",
    body: paymentActionSchema,
    response: "Déclaration traitée",
  },
});
