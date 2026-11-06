import { defineContract } from "@/lib/openapi/contract";
import { askSchema } from "@/modules/assistant/schemas";

export const contract = defineContract({
  POST: {
    summary: "Question posée à l'assistant",
    description:
      "Recherche la fiche de la base qui répond (sens + mots, sans service externe) parmi celles auxquelles le rôle a droit, dans les modules actifs. Réponse écrite et lien, données de la personne (même périmètre que l'écran, église courante), refus sans donnée pour un rôle qui n'a pas l'écran, suggestions, ou question inconnue — remontée alors au Super Admin, anonymisée. Aucune conversation n'est conservée. 30 questions par minute ; 404 si l'assistant est coupé pour l'église.",
    access: "session",
    accessNote: "église courante, assistant actif",
    body: askSchema,
    response: "Réponse de l'assistant",
  },
});
