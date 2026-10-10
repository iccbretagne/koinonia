import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Mes demandes de rendez-vous pastoral",
    description: "Église courante.",
    access: "session",
    response: "Demandes déposées par l'appelant",
  },
});
