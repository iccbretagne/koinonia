import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Photo d'une candidature",
    description: "Spec 073. JPEG réencodé à l'envoi, servi sans cache (`no-store`).",
    access: "session",
    accessNote: "mêmes droits que la fiche, ou le STAR lui-même une fois accueilli dans un département",
    response: "Image JPEG",
    responseType: "image/jpeg",
  },
});
