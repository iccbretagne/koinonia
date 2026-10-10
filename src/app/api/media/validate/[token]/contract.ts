import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Contenu à valider via un lien de partage",
    description: "Retourne l'événement média (photos) ou le projet média (fichiers) à valider. Sans contenu résolu, retourne seulement le jeton avec `event: null`.",
    access: "token",
    accessNote: "jeton de partage `VALIDATOR` ou `PREVALIDATOR`",
    response: "Événement ou projet à valider",
  },
});
