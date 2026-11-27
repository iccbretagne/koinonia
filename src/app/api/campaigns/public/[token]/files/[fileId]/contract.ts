import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Téléchargement d'un fichier par un lien personnel",
    description:
      "Spec 090. Seulement un fichier du questionnaire du lien (autre fichier : 404). `attachment`, `nosniff`, `no-store`. Journalisé sans nom de fichier.",
    access: "token",
    response: "Contenu du fichier",
    responseType: "application/octet-stream",
  },
  DELETE: {
    summary: "Retrait d'un fichier par un lien personnel",
    description: "Spec 090. Tant que la saisie est ouverte (409 sinon). Journalisé.",
    access: "token",
    response: "`{ deleted: true }`",
  },
});
