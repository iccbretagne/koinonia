import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const treasuryAccountSchema = z.object({
  /** Caisse d'où est partie la tranche ; `null` = compte commun (non repris). */
  treasuryAccountId: z.string().min(1).nullable(),
});

export const contract = defineContract({
  PUT: {
    summary: "Compte d'une tranche déjà remise",
    description: "Spec 089 : rattache après coup une tranche remise à un compte de trésorerie (« Payé depuis »), ou la remet sur le compte commun (`null`). La sortie apparaît (ou disparaît) dans le registre de la trésorerie. Refusé (400) si la tranche n'est pas remise, si le compte n'est pas actif, si le mois de la remise est clôturé dans la trésorerie (ancien comme nouveau compte) ou si le module trésorerie est désactivé. Journalisé.",
    access: "accounting:manage",
    accessNote: "dans l'église courante, qui doit être celle de la demande (sinon 404)",
    body: treasuryAccountSchema,
    response: "`{ id, treasuryAccountId }`",
  },
});
