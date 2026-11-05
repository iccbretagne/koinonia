import { defineContract } from "@/lib/openapi/contract";
import { monthQuerySchema } from "@/modules/treasury/schemas";

export const contract = defineContract({
  GET: {
    summary: "Tableau de bord de la trésorerie",
    description:
      "Pour un mois (`month`, AAAA-MM ; défaut : mois courant) : solde de chaque compte et total, ouverture, entrées, sorties et clôture du mois, mêmes chiffres pour le mois précédent et le même mois de l'année précédente, derniers mouvements, chèques en caisse, mois terminés non clôturés, catégories de sortie qui dépassent ou approchent leur budget annuel, caisses passées sous zéro.",
    access: "treasury:manage",
    accessNote: "dans l'église courante",
    query: monthQuerySchema,
    response: "Tableau de bord",
  },
});
