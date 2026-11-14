import { defineContract } from "@/lib/openapi/contract";
import { formUpdateSchema } from "@/modules/forms/schemas";

export { formUpdateSchema };

export const contract = defineContract({
  GET: {
    summary: "Formulaire à construire",
    access: "forms:manage",
    accessNote: "dans l'église du formulaire",
    response: "Formulaire, questions et choix, décomptes (réponses, questions répondues, places tenues par choix)",
  },
  PATCH: {
    summary: "Modification d'un formulaire",
    description:
      "Réglages et, si fournie, liste complète des questions (clé = identifiant existant ou clé provisoire). Dès qu'il y a des réponses : 409 pour supprimer une question répondue ou un choix retenu, changer le type d'une question répondue, baisser des places sous les réponses, changer l'anonymat ou ajouter une question obligatoire. Sessions et niveaux (inscription) : un niveau qui a des inscrits n'est ni supprimé ni ramené sous ses inscrits. Rattachement (participation seulement) : un événement d'église ou de billetterie de l'église du formulaire, sinon 400. Conservation de 1 à 24 mois. Journalisé.",
    access: "forms:manage",
    accessNote: "dans l'église du formulaire",
    body: formUpdateSchema,
    response: "Formulaire mis à jour",
  },
  DELETE: {
    summary: "Suppression d'un formulaire",
    description: "Efface ses réponses tout de suite ; le formulaire répond ensuite comme une adresse inconnue. Journalisé.",
    access: "forms:manage",
    accessNote: "dans l'église du formulaire",
    response: "Suppression effectuée",
  },
});
