import { defineContract } from "@/lib/openapi/contract";
import { pvsInterviewActionSchema } from "@/modules/serving/schemas";

export { pvsInterviewActionSchema };

export const contract = defineContract({
  POST: {
    summary: "Rendez-vous d'entretien d'une candidature (PVS)",
    description:
      "Spec 082. `book` : fixer ou déplacer le rendez-vous sur un créneau libre de l'église (409 s'il est pris ou passé) ; `cancel` : annuler (candidature « À planifier », candidat invité à choisir) ; `outcome` : noter réalisé, absent ou excusé, une fois l'heure passée (409 sinon) ; `invite` : envoyer au candidat le lien pour choisir un créneau (409 sans email sur la fiche). Le candidat et la personne qui reçoit sont prévenus. Journalisé.",
    access: "session",
    accessNote: "équipe Vie des STAR (PVS), `serving:manage` ou Super Admin, dans l'église de la candidature",
    body: pvsInterviewActionSchema,
    response: "Fiche à jour",
  },
});
