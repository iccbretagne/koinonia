import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Fiche de candidature en PDF",
    description:
      "Spec 073. Généré à la demande (nom et logo de l'église, pied de page confidentiel) ; chaque téléchargement est journalisé (`EXPORT`). Les questions Oui/Non sans réponse apparaissent « Non renseigné ».",
    access: "session",
    accessNote: "mêmes droits que la fiche, ou le STAR lui-même une fois accueilli dans un département",
    response: "PDF en pièce à télécharger",
    responseType: "application/pdf",
  },
});
