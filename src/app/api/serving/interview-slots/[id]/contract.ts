import { defineContract } from "@/lib/openapi/contract";
import { updateSlotSchema } from "@/modules/serving/schemas";

export { updateSlotSchema };

const ACCESS_NOTE = "équipe Vie des STAR (PVS), `serving:manage` ou Super Admin, dans l'église du créneau";

export const contract = defineContract({
  PATCH: {
    summary: "Modifier un créneau d'entretien",
    description:
      "Spec 082. Créneau à venir seulement (409). Mêmes règles qu'à la création. Un rendez-vous réservé suit le créneau : le candidat est prévenu par email (avec son lien), la personne qui reçoit (et l'ancienne) par notification. Journalisé.",
    access: "session",
    accessNote: ACCESS_NOTE,
    body: updateSlotSchema,
    response: "`{ ok: true }`",
  },
  DELETE: {
    summary: "Retirer un créneau d'entretien",
    description:
      "Un rendez-vous réservé est annulé : la candidature passe « À planifier » (créneau retiré), le candidat est invité par email à choisir un autre créneau, la personne qui reçoit est prévenue. Journalisé.",
    access: "session",
    accessNote: ACCESS_NOTE,
    response: "`{ ok: true }`",
  },
});
