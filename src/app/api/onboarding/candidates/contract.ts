import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Fiches STAR candidates à la liaison du compte",
    description: "Réconciliation par email : ne renvoie que les fiches STAR non liées dont l'email correspond à l'email vérifié du compte de l'appelant.",
    access: "session",
    accessNote: "toute personne connectée, pour son propre email uniquement",
    response: "`{ candidates }` : fiches STAR non liées correspondant à l'email du compte",
  },
});
