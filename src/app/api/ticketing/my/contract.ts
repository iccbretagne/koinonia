import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Mes réservations de billetterie",
    description: "Réservations dont l'email est celui du compte connecté (événements non clôturés), avec le lien « Ma réservation ».",
    access: "session",
    response: "Liste des réservations",
  },
});
