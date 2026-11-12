import { defineContract } from "@/lib/openapi/contract";
import { formCreateSchema } from "@/modules/forms/schemas";

export { formCreateSchema };

export const contract = defineContract({
  GET: {
    summary: "Formulaires de l'église courante",
    access: "forms:manage",
    response: "Formulaires non supprimés avec leur état et leurs décomptes de réponses",
  },
  POST: {
    summary: "Création d'un formulaire",
    description: "Crée un brouillon (inscription, participation ou sondage ; public ou comptes connectés ; seul un sondage peut être anonyme), avec une adresse unique dans l'église. Journalisé.",
    access: "forms:manage",
    body: formCreateSchema,
    response: "Formulaire créé",
    status: 201,
  },
});
