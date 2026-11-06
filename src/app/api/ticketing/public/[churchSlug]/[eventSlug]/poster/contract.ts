import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Affiche publique d'un événement",
    description: "Servie seulement pour un événement ouvert ou clos aux inscriptions (404 sinon).",
    access: "public",
    response: "Image",
    responseType: "image/*",
  },
});
