import { defineContract } from "@/lib/openapi/contract";
import { assignmentActionSchema } from "@/modules/serving/schemas";

export { assignmentActionSchema };

export const contract = defineContract({
  PATCH: {
    summary: "Décision du département sur une affectation",
    description:
      "Spec 073. `accept` (en attente) : la personne devient STAR du département — fiche STAR créée depuis la candidature si aucune n'est rattachée — et la période d'observation commence, sa durée étant figée au réglage du moment. `confirm` (en observation, avant ou après l'échéance) : STAR confirmé, PVS notifié. `send-back` (en attente ou en observation, motif obligatoire) : renvoi au PVS ; pendant l'observation, la personne est retirée du département et ses services à venir y sont supprimés ; PVS notifié, copie à l'adresse du PVS. Toute autre transition : 409. Journalisé.",
    access: "session",
    accessNote: "responsable (principal ou adjoint) du département de l'affectation, Ministre de son ministère, ou Super Admin",
    body: assignmentActionSchema,
    response: "`{ applicationId }`",
  },
});
