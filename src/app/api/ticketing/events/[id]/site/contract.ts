import { defineContract } from "@/lib/openapi/contract";
import { siteDocumentSchema } from "@/modules/ticketing/schemas";

export { siteDocumentSchema };

export const contract = defineContract({
  GET: {
    summary: "Site de l'événement : brouillon et état",
    description: "Crée le site au premier appel (document de départ, adresse dérivée de l'événement). Renvoie le brouillon, l'état de publication et les problèmes de lisibilité à corriger avant de publier.",
    access: "session",
    accessNote: "organisateur ou communication de l'événement (rôle `site`)",
    response: "Site : adresse, brouillon, publié, `issues`",
  },
  PUT: {
    summary: "Enregistrement du brouillon du site",
    description: "Valide le document (thème, pages, blocs), la lisibilité des textes sur leurs fonds et l'appartenance des images au site ; refuse en 400 avec les messages. Journalisé.",
    access: "session",
    accessNote: "organisateur ou communication de l'événement (rôle `site`)",
    body: siteDocumentSchema,
    response: "Site enregistré",
  },
});
