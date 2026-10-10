import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Lien de téléchargement d'une pièce jointe",
    access: "session",
    accessNote: "déposant, ou `accounting:manage` (ou périmètre `accounting:view`) dans l'église de la pièce, qui fait autorité",
    response: "`{ url, filename, mimeType }` : URL présignée",
  },
  DELETE: {
    summary: "Suppression d'une pièce jointe",
    access: "session",
    accessNote: "pièce orpheline : son déposant ; rattachée : le demandeur, tant que la demande est `SUBMITTED`",
    response: "`{ deleted: true }`",
  },
});
