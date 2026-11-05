import { defineContract } from "@/lib/openapi/contract";
import { ledgerQuerySchema } from "@/modules/treasury/schemas";

export const contract = defineContract({
  GET: {
    summary: "Registre de la trésorerie",
    description:
      "Lignes d'un compte (`accountId`) ou de tous les comptes, sur une période (`from`/`to`, AAAA-MM-JJ), avec le solde après chaque ligne ; ouverture, entrées, sorties et clôture de la période, qui se recoupent (tous comptes, les transferts ne sont ni des entrées ni des sorties) ; solde de chaque compte ; alertes de caisse négative. Les paiements de demandes et les abondements de la navette payés depuis un compte de trésorerie y figurent en lecture seule, avec un lien vers leur origine (ADR-0027). `categoryId` et `method` filtrent les lignes affichées sans changer les totaux.",
    access: "treasury:manage",
    accessNote: "dans l'église courante",
    query: ledgerQuerySchema,
    response: "Registre",
  },
});
