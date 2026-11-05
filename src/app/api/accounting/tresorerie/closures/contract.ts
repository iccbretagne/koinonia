import { defineContract } from "@/lib/openapi/contract";
import { closeMonthSchema } from "@/modules/treasury/schemas";

export const contract = defineContract({
  GET: {
    summary: "Mois clôturés et réouvertures",
    description: "Mois clôturés (du plus récent au plus ancien) et réouvertures passées avec leur motif, leur auteur et leur date.",
    access: "treasury:manage",
    accessNote: "dans l'église courante",
    response: "`{ closures, reopenings }`",
  },
  POST: {
    summary: "Clôture d'un mois",
    description: "Seul un mois terminé se clôture. Ses lignes ne se modifient plus et ses soldes sont figés : aucune saisie, correction, suppression ni reprise datée de ce mois n'est acceptée. Journalisée.",
    access: "treasury:manage",
    accessNote: "dans l'église courante",
    body: closeMonthSchema,
    status: 201,
    response: "`{ month }`",
  },
});
