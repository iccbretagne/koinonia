import { defineContract } from "@/lib/openapi/contract";
import { ledgerQuerySchema } from "@/modules/shuttle/schemas";

export const contract = defineContract({
  GET: {
    summary: "Export d'une période du registre de la navette",
    description: "ZIP : `releve.xlsx` (relevé avec solde courant, synthèse par type et par mois) et les justificatifs des lignes de la période. Journalisé.",
    access: "shuttle:manage",
    accessNote: "dans l'église courante",
    query: ledgerQuerySchema.pick({ from: true, to: true }),
    response: "Archive ZIP",
    responseType: "application/zip",
  },
});
