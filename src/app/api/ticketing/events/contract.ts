import { defineContract } from "@/lib/openapi/contract";
import { eventCreateSchema } from "@/modules/ticketing/schemas";

export { eventCreateSchema };

export const contract = defineContract({
  GET: {
    summary: "Événements de billetterie de l'église courante",
    description:
      "Tous les événements de l'église pour `ticketing:manage` ; sinon ceux, non clôturés, où l'on a un rôle d'événement (spec 074).",
    access: "session",
    accessNote: "`ticketing:manage` dans l'église courante, ou un rôle sur l'événement",
    response: "Liste des événements avec places prises",
  },
  POST: {
    summary: "Création d'un événement de billetterie",
    description:
      "Crée un brouillon : adresse publique (slug) unique dans l'église, préfixe de référence déduit du titre et de l'année, places ouvertes = jauge, tarif adulte gratuit. Journalisée.",
    access: "ticketing:manage",
    body: eventCreateSchema,
    status: 201,
    response: "Événement créé",
  },
});
