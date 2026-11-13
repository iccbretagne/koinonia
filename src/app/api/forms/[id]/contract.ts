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
      "Réglages et, si fournie, liste complète des questions (clé = identifiant existant ou clé provisoire). Dès qu'il y a des réponses : 409 pour supprimer une question répondue ou un choix retenu, changer le type d'une question répondue, baisser des places sous les réponses, changer l'anonymat ou ajouter une question obligatoire. Conservation de 1 à 24 mois. Journalisé.",
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
