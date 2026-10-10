import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  DELETE: {
    summary: "Révocation d'un lien de partage",
    description: "Le périmètre requis est résolu depuis le lien lui-même, pas depuis l'église courante du client : gestion des photos pour un lien portant sur des événements, gestion des visuels pour un lien portant sur des projets. Journalisé. Lien introuvable : 404.",
    access: "session",
    accessNote: "`media:manage` dans l'église du lien, ou équipe de l'activité concernée (Photos et/ou Visuels selon le contenu du lien)",
    response: "`{ deleted: id }`",
  },
});
