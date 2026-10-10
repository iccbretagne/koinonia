import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Statistiques du suivi pastoral",
    access: "care:view",
    accessNote: "`care:view` ou `care:qualify` (vue d'ensemble), église courante",
    response: "Volumes par état, accompagnant et motif de rejet",
  },
});
