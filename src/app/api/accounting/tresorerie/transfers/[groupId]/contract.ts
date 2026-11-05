import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { transferInputSchema } from "@/modules/treasury/schemas";

export const contract = defineContract({
  PATCH: {
    summary: "Correction d'un transfert entre comptes",
    description: "Les deux lignes changent ensemble (comptes, date, montant, libellé). Ancienne et nouvelle date dans des mois ouverts. Journalisée.",
    access: "treasury:manage",
    accessNote: "dans l'église du transfert",
    params: z.object({ groupId: z.string() }),
    body: transferInputSchema,
    response: "`{ groupId }`",
  },
});
