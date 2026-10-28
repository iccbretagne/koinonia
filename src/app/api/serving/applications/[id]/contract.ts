import { defineContract } from "@/lib/openapi/contract";
import { applicationActionSchema } from "@/modules/serving/schemas";

export { applicationActionSchema };

export const contract = defineContract({
  GET: {
    summary: "Fiche de candidature",
    description:
      "Spec 073. Église déterminée par la candidature. Chaque consultation est journalisée (`VIEW`). Hors équipe PVS : ni motif de non-retenue, ni fiche STAR rattachée, ni affectations des autres départements. Un département qui a renvoyé n'y a plus accès (403).",
    access: "session",
    accessNote: "équipe PVS, `serving:manage`, ou responsable/Ministre d'un département dont l'affectation est en attente, en observation ou confirmée",
    response: "Fiche complète, affectations visibles et droits de l'appelant",
  },
  PATCH: {
    summary: "Décision du PVS sur une candidature",
    description:
      "`reject` : ne pas retenir (motif facultatif), possible tant qu'aucun département ne suit la personne (409 sinon) ; les renvois en attente sont considérés comme traités. `link-member` : rattacher à une fiche STAR existante de l'église (404 si elle n'en est pas), ou retirer le rattachement (`null`), impossible une fois la personne accueillie (409). Journalisé.",
    access: "session",
    accessNote: "équipe PVS, `serving:manage` ou Super Admin, dans l'église de la candidature",
    body: applicationActionSchema,
    response: "Fiche à jour",
  },
});
