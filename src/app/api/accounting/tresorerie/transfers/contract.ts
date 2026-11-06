import { defineContract } from "@/lib/openapi/contract";
import { transferInputSchema } from "@/modules/treasury/schemas";

export const contract = defineContract({
  POST: {
    summary: "Transfert entre deux comptes de l'église",
    description:
      "Deux lignes liées : sortie du compte source, entrée sur le compte cible. Le total de l'église ne change pas ; le transfert n'est ni une recette ni une dépense. Refusé dans un mois clôturé. Journalisé.",
    access: "treasury:manage",
    accessNote: "dans l'église courante",
    body: transferInputSchema,
    status: 201,
    response: "`{ groupId, ids }`",
  },
});
