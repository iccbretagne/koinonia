import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { accountPatchSchema } from "@/modules/treasury/schemas";

export const contract = defineContract({
  PATCH: {
    summary: "Modification ou archivage d'un compte de trésorerie",
    description:
      "Nom, nature, ordre, solde et date de départ (refusés si l'ancienne ou la nouvelle date tombe dans un mois clôturé, ou si des lignes précèdent la nouvelle date), `archived` pour archiver ou réactiver. Un compte archivé n'accepte plus de saisie ; son historique reste lisible. Journalisée avant/après.",
    access: "treasury:manage",
    accessNote: "dans l'église du compte",
    params: z.object({ id: z.string() }),
    body: accountPatchSchema,
    response: "Compte",
  },
});
