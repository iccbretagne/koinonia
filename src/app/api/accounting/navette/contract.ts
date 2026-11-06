import { defineContract } from "@/lib/openapi/contract";
import { ledgerQuerySchema } from "@/modules/shuttle/schemas";

export const contract = defineContract({
  GET: {
    summary: "Registre de la navette : relevé, soldes et synthèses",
    description:
      "Solde à date, totaux de la période (`from`/`to`, AAAA-MM-JJ ; absents = depuis le début), relevé chronologique avec solde courant, répartitions par type, mois et location, cautions en cours, avances personnelles avec l'état de leur remboursement. Les avances de budget versées par la comptabilité au département Navette y figurent en lecture seule (spec 073, lien B). Les notes de frais hors registre ne sont listées qu'au gestionnaire.",
    access: "shuttle:manage",
    accessNote: "ou membre de l'équipe navette (fonction de département NAVETTE), dans l'église courante",
    query: ledgerQuerySchema,
    response: "Relevé et synthèses",
  },
});
