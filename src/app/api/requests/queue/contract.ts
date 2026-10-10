import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const querySchema = z.object({
  churchId: z.string().min(1),
  fn: z.enum(["SECRETARIAT", "COMMUNICATION", "PRODUCTION_MEDIA"]),
  cursor: z.string().max(200).optional(),
  q: z.string().max(100).optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Demandes traitées d'une file d'équipe",
    description: "Alimente « Voir plus » et la recherche dans l'historique de l'onglet « Traitées » (spec 063), par curseur. Renvoie une liste vide si la fonction n'est portée par aucun département.",
    access: "planning:view",
    accessNote: "dans l'église visée, et même contrôle d'accès que les pages de traitement de la file de la fonction (403 sinon)",
    query: querySchema,
    response: "`{ items, nextCursor }`",
  },
});
