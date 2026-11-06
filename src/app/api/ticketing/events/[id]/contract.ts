import { defineContract } from "@/lib/openapi/contract";
import { eventUpdateSchema } from "@/modules/ticketing/schemas";

export { eventUpdateSchema };

export const contract = defineContract({
  GET: {
    summary: "Détail d'un événement de billetterie",
    description:
      "Paramétrage, tarifs, options et variantes (avec quantités réservées), rôles et places prises. L'église qui fait foi est celle de l'événement : autre église ou introuvable → 404.",
    access: "session",
    accessNote: "un rôle sur l'événement (organisateur implicite pour `ticketing:manage`)",
    response: "Événement et droits de l'appelant",
  },
  PATCH: {
    summary: "Paramétrage d'un événement",
    description:
      "Informations, jauge et places ouvertes (jamais sous les inscrits, jamais au-dessus de la jauge), tarifs par tranche d'âge, moyens de paiement (IBAN propre à l'événement, vérifié ; jamais celui de l'église), règles de paiement, d'annulation et de mineurs, ajout sur place, conservation, état. Journalisé.",
    access: "session",
    accessNote: "organisateur de l'événement",
    body: eventUpdateSchema,
    response: "Événement mis à jour",
  },
});
