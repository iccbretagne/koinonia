import { defineContract } from "@/lib/openapi/contract";
import { entryInputSchema } from "@/modules/assistant/schemas";

export const contract = defineContract({
  GET: {
    summary: "Base de connaissances de l'assistant",
    description: "Fiches fournies avec Koinonia (corrigées ou masquées le cas échéant) et fiches ajoutées, avec leur audience et leur module.",
    access: "superAdmin",
    response: "Fiches",
  },
  POST: {
    summary: "Ajouter une fiche à la base de l'assistant",
    description: "Lien interne uniquement ; audience par rôles (aucun = tous). Une mise à jour de Koinonia ne l'efface jamais. Journalisé.",
    access: "superAdmin",
    body: entryInputSchema,
    status: 201,
    response: "{ key }",
  },
});
