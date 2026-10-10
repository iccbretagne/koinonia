import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Lecture d'une séquence par lien public",
    description: "La séquence doit appartenir au périmètre du lien (403) et le culte être publié (410).",
    access: "token",
    responseType: "audio/mpeg",
    response: "Flux audio du rendu de la séquence (requêtes `Range` acceptées, réponse 206 partielle)",
  },
});
