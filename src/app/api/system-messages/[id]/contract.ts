import { defineContract } from "@/lib/openapi/contract";
import { updateSchema } from "@/modules/messages/schemas";

export { updateSchema };

export const contract = defineContract({
  GET: {
    summary: "Détail d'un message système",
    description:
      "Pour son auteur (même garde que la publication, sur l'église du message) : message et statistiques. Pour une personne du public : le message seul. 404 pour toute autre personne, sans révéler l'existence du message (spec 071).",
    access: "session",
    accessNote: "auteur ou personne du public",
    response: "Message (et `stats` pour l'auteur)",
  },
  PATCH: {
    summary: "Correction d'un message système",
    description:
      "Programmé : tout se modifie. En cours : titre, texte, lien et fin seulement (400 si le public, la sévérité ou le début changent), sans nouvelle notification. Passé ou retiré : 400. Journalisé.",
    access: "messages:publish",
    accessNote: "dans l'église du message ; Super Admin pour un message d'instance",
    body: updateSchema,
    response: "Message à jour",
  },
});
