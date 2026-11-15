import { defineContract } from "@/lib/openapi/contract";
import { createSlotsSchema, slotsQuerySchema } from "@/modules/serving/schemas";

export { createSlotsSchema, slotsQuerySchema };

const ACCESS_NOTE = "équipe Vie des STAR (PVS), `serving:manage` ou Super Admin, dans l'église visée";

export const contract = defineContract({
  GET: {
    summary: "Créneaux d'entretien de l'église",
    description:
      "Spec 082. Créneaux depuis 7 jours (ou `from`), libres, réservés (prénom et nom du candidat) ou passés ; « à réattribuer » quand la personne qui reçoit n'est plus dans l'équipe PVS. Comptes qui peuvent recevoir et nombre d'entretiens à compléter.",
    access: "session",
    accessNote: ACCESS_NOTE,
    query: slotsQuerySchema,
    response: "Créneaux, personnes qui peuvent recevoir, entretiens à compléter",
  },
  POST: {
    summary: "Créer des créneaux d'entretien",
    description:
      "`slots` (liste) ou `series` (jours, plage horaire, durée) à l'heure de Paris ; 200 créneaux au plus. La personne qui reçoit doit faire partie de l'équipe PVS (400) ; pas de créneau passé (400) ; deux créneaux d'une même personne ne se chevauchent jamais (400/409) ; un lieu ou un lien de visio https, pas les deux. Ouvre une vague d'invitation des candidatures « À planifier ». Journalisé.",
    access: "session",
    accessNote: ACCESS_NOTE,
    body: createSlotsSchema,
    status: 201,
    response: "`{ created }`",
  },
});
