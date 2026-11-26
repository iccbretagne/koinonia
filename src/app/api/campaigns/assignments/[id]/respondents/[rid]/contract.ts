import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  DELETE: {
    summary: "Retrait d'un répondant",
    description: "Spec 090. Son lien personnel cesse de fonctionner ; ses réponses déjà saisies restent. Journalisé.",
    access: "session",
    accessNote: "gestionnaire de la campagne",
    response: "`{ deleted: true }`",
  },
});
