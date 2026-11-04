import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  DELETE: {
    summary: "Retrait d'une affectation",
    description: "Le badge cesse d'être reconnu à la prochaine synchronisation. Journalisé.",
    access: "session",
    accessNote: "organisateur de l'événement",
    response: "`{ ok: true }`",
  },
});
