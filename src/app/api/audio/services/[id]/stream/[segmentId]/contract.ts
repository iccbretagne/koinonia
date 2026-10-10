import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Lecture d'une séquence",
    description: "Culte publié uniquement (410).",
    access: "audio:listen",
    accessNote: "`audio:listen` dans l'église du culte, ou membre d'une église bénéficiaire d'un partage de bibliothèque (spec 036)",
    responseType: "audio/mpeg",
    response: "Flux audio du rendu de la séquence (requêtes `Range` acceptées, réponse 206 partielle)",
  },
});
