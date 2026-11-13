import { defineContract } from "@/lib/openapi/contract";
import { publicAnswersSchema } from "@/modules/forms/schemas";

export { publicAnswersSchema };

export const contract = defineContract({
  POST: {
    summary: "Envoi d'une réponse",
    description:
      "Formulaire public : vérification anti-robots et 5 envois par minute par adresse IP ; réservé : compte de l'église. Réponses validées par question (types, obligatoires, affichage conditionnel). Choix complet : liste d'attente si elle est active, sinon 409. Doublon (même compte, ou même adresse email pour un public nominatif) : 409, et pour un public le lien de gestion de la réponse existante est renvoyé à l'adresse. Sondage anonyme : aucune identité enregistrée. Accusé de réception (email sans compte, notification avec compte).",
    access: "public",
    body: publicAnswersSchema,
    response: "État de la réponse (confirmée ou en liste d'attente) et, sans compte, le jeton de gestion",
    status: 201,
  },
});
