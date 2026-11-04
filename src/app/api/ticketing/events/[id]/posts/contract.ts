import { defineContract } from "@/lib/openapi/contract";
import { postSchema } from "@/modules/ticketing/schemas";

export { postSchema };

export const contract = defineContract({
  GET: {
    summary: "Équipe d'un événement : postes et affectations",
    description: "Postes, affectations (compte de l'église ou intervenant nommé) avec créneaux et code de badge à imprimer.",
    access: "session",
    accessNote: "organisateur de l'événement",
    response: "`{ posts, assignments }`",
  },
  POST: {
    summary: "Création d'un poste",
    description: "Porte principale, sortie de secours, parking, vestiaire… Propre à l'événement ; journalisé.",
    access: "session",
    accessNote: "organisateur de l'événement",
    body: postSchema,
    status: 201,
    response: "Poste créé",
  },
});
