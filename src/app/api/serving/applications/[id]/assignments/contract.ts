import { defineContract } from "@/lib/openapi/contract";
import { assignSchema } from "@/modules/serving/schemas";

export { assignSchema };

export const contract = defineContract({
  POST: {
    summary: "Orienter une candidature vers des départements",
    description:
      "Spec 073. Crée une affectation en attente par département (départements non système de l'église, 400 sinon) et valide la candidature ; sert aussi à réaffecter après un renvoi, les renvois en attente étant alors considérés comme traités. Refusé (409) si la candidature n'est pas retenue, si le département suit déjà la personne, ou si la fiche STAR rattachée en est déjà membre. Notifie les responsables et le Ministre de chaque département (lien seul). Journalisé.",
    access: "session",
    accessNote: "équipe PVS, `serving:manage` ou Super Admin, dans l'église de la candidature",
    body: assignSchema,
    response: "Fiche à jour",
  },
});
