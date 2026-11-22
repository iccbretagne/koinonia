import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  DELETE: {
    summary: "Retirer un co-gestionnaire d'un formulaire",
    description: "Réservé à l'auteur et à `forms:manage`. Notifié, journalisé.",
    access: "forms:manage",
    accessNote: "ou auteur du formulaire avec accès délégué",
    response: "`{ deleted: true }`",
  },
});
