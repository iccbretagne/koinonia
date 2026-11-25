import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Lien de téléchargement d'une pièce jointe",
    description: "`?inline=1` (spec 089) : lien d'affichage dans le navigateur au lieu du téléchargement, honoré pour un PDF, JPEG, PNG ou WebP seulement (sinon téléchargement).",
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
