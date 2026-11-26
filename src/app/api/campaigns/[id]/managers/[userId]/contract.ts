import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  DELETE: {
    summary: "Retrait d'un gestionnaire",
    description: "Jamais le dernier gestionnaire de la campagne (409). Journalisé.",
    access: "campaigns:manage",
    accessNote: "dans l'église de la campagne, ou gestionnaire désigné",
    response: "`{ deleted: true }`",
  },
});
