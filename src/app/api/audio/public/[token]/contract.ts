import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Culte partagé par lien public",
    description: "404 si le lien n'existe pas ; 410 s'il est révoqué ou si le culte n'est plus publié.",
    access: "token",
    response: "Culte et séquences couverts par le lien",
  },
});
