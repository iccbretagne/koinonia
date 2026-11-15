import { defineContract } from "@/lib/openapi/contract";
import { publicInterviewActionSchema } from "@/modules/serving/schemas";

export { publicInterviewActionSchema };

export const contract = defineContract({
  GET: {
    summary: "Mon rendez-vous d'entretien (lien du candidat)",
    description:
      "Spec 082. Jeton dérivé du lien reçu ; forme ou empreinte inconnue, candidature effacée : même 404. 30 requêtes par minute et par IP. Rendez-vous en cours (date, heure, durée, lieu ou visio, nom de la personne qui reçoit), possibilité de le changer (jusqu'à 24 h avant), créneaux libres à venir, adresse du PVS.",
    access: "token",
    response: "Rendez-vous, créneaux libres et adresse du PVS",
  },
  POST: {
    summary: "Choisir, changer ou annuler mon rendez-vous",
    description:
      "`book` : réserver un créneau libre (409 s'il vient d'être pris, est passé, ou si le rendez-vous en cours est dans moins de 24 h) ; `decline` : aucun créneau ne convient (candidature « À planifier ») ; `cancel` : annuler jusqu'à 24 h avant (409 au-delà). Le créneau libéré est reproposé ; le PVS et la personne qui reçoit sont prévenus.",
    access: "token",
    body: publicInterviewActionSchema,
    response: "Vue à jour",
  },
});
