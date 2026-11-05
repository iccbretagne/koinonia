import { defineContract } from "@/lib/openapi/contract";
import { periodQuerySchema } from "@/modules/treasury/schemas";

export const contract = defineContract({
  GET: {
    summary: "Export de la trésorerie d'une période",
    description: "ZIP : `tresorerie.xlsx` (registre avec soldes, synthèse, totaux par catégorie et par objet, par moyen, par mois) et les justificatifs des lignes de la période. Journalisé.",
    access: "treasury:manage",
    accessNote: "dans l'église courante",
    query: periodQuerySchema,
    responseType: "application/zip",
    response: "Archive ZIP",
  },
});
