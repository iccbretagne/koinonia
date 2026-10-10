import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Nombre de nouvelles opportunités non vues",
    description: "Offres d'emploi et missions freelance d'autrui publiées depuis la dernière visite de `/jobs` (30 derniers jours à défaut), pour la pastille du menu (spec 042, 064).",
    access: "session",
    accessNote: "compteur de l'appelant",
    response: "`{ count }`",
  },
  POST: {
    summary: "Marquage de la visite de la section Emploi",
    description: "Enregistre la visite de `/jobs` et remet le compteur à zéro.",
    access: "session",
    accessNote: "compteur de l'appelant",
    response: "`{ ok: true }`",
  },
});
