import { defineContract } from "@/lib/openapi/contract";
import { z } from "zod";
import { siteDocumentSchema } from "@/modules/ticketing/schemas";

export { siteDocumentSchema };

export const afterCloseSchema = z.object({ afterCloseDays: z.number().int().min(1).max(365) }).strict();

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
  PATCH: {
    summary: "Durée d'affichage après la clôture",
    description: "Nombre de jours (1 à 365) pendant lesquels le site affiche « Événement terminé » après la clôture de l'événement, puis répond 404. 30 par défaut.",
    access: "session",
    accessNote: "organisateur ou communication de l'événement (rôle `site`)",
    body: afterCloseSchema,
    response: "Site mis à jour",
  },
});
