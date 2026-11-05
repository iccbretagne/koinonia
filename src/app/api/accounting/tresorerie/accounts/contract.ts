import { defineContract } from "@/lib/openapi/contract";
import { accountInputSchema } from "@/modules/treasury/schemas";

export const contract = defineContract({
  GET: {
    summary: "Comptes de trésorerie de l'église",
    description: "Caisse, coffre, compte en ligne… avec leur solde de départ daté ; les comptes archivés sont inclus et marqués.",
    access: "treasury:manage",
    accessNote: "dans l'église courante",
    response: "Comptes",
  },
  POST: {
    summary: "Création d'un compte de trésorerie",
    description: "Nom unique dans l'église, nature (caisse, en ligne, autre), solde de départ daté (refusé dans un mois clôturé). Journalisée.",
    access: "treasury:manage",
    accessNote: "dans l'église courante",
    body: accountInputSchema,
    status: 201,
    response: "Compte créé",
  },
});
