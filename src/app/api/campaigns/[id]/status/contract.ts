import { defineContract } from "@/lib/openapi/contract";
import { campaignStatusSchema } from "@/modules/campaigns/schemas";

export { campaignStatusSchema };

export const contract = defineContract({
  POST: {
    summary: "Ouverture, clôture ou réouverture d'une campagne",
    description:
      "open : brouillon (ou clôturée) → ouverte, au moins un destinataire ; la première ouverture prévient tous les répondants (lien personnel par email pour un sans-compte). close : ouverte → clôturée, lecture seule, la conservation des fichiers court. reopen : clôturée → ouverte. 409 si l'action ne correspond pas à l'état. Journalisé.",
    access: "campaigns:manage",
    accessNote: "dans l'église de la campagne, ou gestionnaire désigné",
    body: campaignStatusSchema,
    response: "Campagne dans son nouvel état (`id`, `status`, `openedAt`, `closedAt`)",
  },
});
