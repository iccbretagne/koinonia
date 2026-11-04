import { defineContract } from "@/lib/openapi/contract";
import { rolesSchema } from "@/modules/ticketing/schemas";

export { rolesSchema };

export const contract = defineContract({
  GET: {
    summary: "Rôles d'un événement et comptes de l'église",
    description: "Rôles attribués et comptes de l'église de l'événement (STAR compris), pour le choix.",
    access: "session",
    accessNote: "organisateur de l'événement",
    response: "`{ roles, accounts }`",
  },
  PUT: {
    summary: "Attribution des rôles d'un événement",
    description:
      "Remplace la liste : organisateur, trésorier, accueil, restauration, observateur, cumulables, à n'importe quel compte de l'église (400 sinon). Les nouveaux titulaires sont notifiés ; journalisée. Les rôles s'arrêtent à la clôture.",
    access: "session",
    accessNote: "organisateur de l'événement",
    body: rolesSchema,
    response: "Rôles enregistrés",
  },
});
