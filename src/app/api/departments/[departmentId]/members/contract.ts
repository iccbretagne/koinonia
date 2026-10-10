import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Liste des STAR d'un département",
    access: "members:view",
    accessNote: "borné au périmètre départemental de l'appelant",
    response: "STAR du département, triés par nom de famille",
  },
});
