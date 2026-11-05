import { defineContract } from "@/lib/openapi/contract";
import { statsQuerySchema } from "@/modules/assistant/schemas";

export const contract = defineContract({
  GET: {
    summary: "Usage de l'assistant sur une période",
    description: "Compteurs journaliers d'instance (questions, réponses, suggestions, inconnues, données, avis) et part « Utile ». Aucune donnée de personne. Défaut : 30 derniers jours.",
    access: "superAdmin",
    query: statsQuerySchema,
    response: "Compteurs, totaux et nombre de questions à traiter",
  },
});
