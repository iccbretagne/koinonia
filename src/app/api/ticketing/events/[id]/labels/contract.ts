import { defineContract } from "@/lib/openapi/contract";
import { labelsQuerySchema, markPrintedSchema } from "@/modules/ticketing/schemas";

export { labelsQuerySchema, markPrintedSchema };

export const contract = defineContract({
  GET: {
    summary: "Étiquettes de préparation nominative",
    description:
      "Options à préparation nominative : tout, un plat (`variantId`), une réservation (`bookingId`) ou les nouvelles et modifiées depuis la dernière impression (`changed`). Nom, plat, allergies, référence, « à régler », code d'étiquette (ouvre la distribution, refusé au contrôle d'entrée), étiquette périmée.",
    access: "session",
    accessNote: "restauration ou organisateur de l'événement",
    query: labelsQuerySchema,
    response: "Étiquettes",
  },
  POST: {
    summary: "Marquer des étiquettes imprimées",
    description: "Enregistre la version imprimée de chaque élément : un changement ultérieur de plat, de nom ou d'état la rend « à refaire ».",
    access: "session",
    accessNote: "restauration ou organisateur de l'événement",
    body: markPrintedSchema,
    response: "`{ printed }`",
  },
});
