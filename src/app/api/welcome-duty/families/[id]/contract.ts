import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  PATCH: {
    summary: "Modification d'une famille du pool",
    description: "Active ou désactive la famille et/ou change son nom ; 404 si elle n'appartient pas à l'église courante.",
    access: "events:manage",
    accessNote: "dans l'église courante",
    body: { contentType: "application/json", description: "Champs facultatifs : `active` (booléen) et `familyName` (texte)." },
    response: "Famille mise à jour",
  },
  DELETE: {
    summary: "Retrait d'une famille du pool",
    description: "404 si elle n'appartient pas à l'église courante.",
    access: "events:manage",
    accessNote: "dans l'église courante",
    response: "`{ success: true }`",
  },
});
