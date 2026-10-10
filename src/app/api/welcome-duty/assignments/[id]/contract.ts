import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  DELETE: {
    summary: "Retrait d'une affectation de permanence d'accueil",
    description: "404 si l'affectation n'appartient pas à l'église courante.",
    access: "events:manage",
    accessNote: "dans l'église courante",
    response: "`{ success: true }`",
  },
});
