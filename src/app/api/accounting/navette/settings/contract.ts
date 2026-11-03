import { defineContract } from "@/lib/openapi/contract";
import { settingsInputSchema } from "@/modules/shuttle/schemas";

export const contract = defineContract({
  GET: {
    summary: "Réglages de la navette",
    access: "shuttle:manage",
    accessNote: "dans l'église courante",
    response: "`{ lowBalanceThreshold }`",
  },
  PUT: {
    summary: "Seuil d'alerte de solde bas de la navette",
    description: "`null` désactive l'alerte. L'alerte part au franchissement du seuil à la baisse, vers la comptabilité et les responsables de la navette. Journalisé.",
    access: "shuttle:manage",
    accessNote: "dans l'église courante",
    body: settingsInputSchema,
    response: "`{ lowBalanceThreshold }`",
  },
});
