import { defineContract } from "@/lib/openapi/contract";
import { receiptSchema } from "@/modules/ticketing/schemas";

export { receiptSchema };

export const contract = defineContract({
  POST: {
    summary: "Encaissement direct sur une réservation",
    description:
      "Espèces, chèque (ou autre moyen reçu) sur les éléments cochés, à régler ou déclarés : ils passent à payé. L'accueil n'encaisse que les entrées, la restauration que les options à retirer sur place (403 sinon). Idempotent par `opId`.",
    access: "session",
    accessNote: "organisateur, trésorier, accueil (entrées) ou restauration (options à retirer)",
    body: receiptSchema,
    status: 201,
    response: "Encaissement enregistré",
  },
});
