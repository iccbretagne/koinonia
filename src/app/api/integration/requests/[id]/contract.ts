import { defineContract } from "@/lib/openapi/contract";
import { familyPatchSchema } from "@/modules/integration/schemas";

export const contract = defineContract({
  GET: {
    summary: "Détail d'une demande d'intégration",
    access: "integration:manage",
    accessNote: "dans l'église de la demande ; ou équipe Intégration/MSDP ; un berger/co-berger n'accède qu'aux demandes affectées à l'une de ses familles, jamais à une demande encore sans famille (403 sinon)",
    response: "Demande avec berger affecté et fiche membre liée",
  },
  PATCH: {
    summary: "Action sur une demande d'intégration",
    description:
      "Cycle de vie de la demande, selon `action` : `assign` (famille et berger), `contact`, `whatsapp`, `integrate`, `abandon` (avec motif), `note`, `reopen` (`resume` ou `restart`), " +
      "`wait` (attente de recontact ou de mission), `resume`, `handback` (renvoi à l'équipe par le berger, raison obligatoire), `relance`, `edit` (coordonnées et profil). " +
      "Les transitions invalides sont refusées. Chaque changement est inscrit à l'historique ; le berger est notifié à l'affectation et au retrait, l'équipe Intégration au renvoi.",
    access: "integration:manage",
    accessNote: "ou équipe Intégration/MSDP ; un berger/co-berger n'agit que sur les demandes affectées à l'une de ses familles, avec les seules transitions qui lui sont ouvertes",
    body: familyPatchSchema,
    response: "Demande mise à jour, avec berger affecté",
  },
  DELETE: {
    summary: "Suppression définitive d'une demande d'intégration",
    description: "Spec 057. Refusée (409) tant qu'un rendez-vous pastoral ou un suivi de nouveau converti en est issu. Journalisé.",
    access: "integration:delete",
    accessNote: "dans l'église de la demande",
    response: "`{ id }`",
  },
});
