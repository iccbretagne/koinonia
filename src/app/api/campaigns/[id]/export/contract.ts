import { defineContract } from "@/lib/openapi/contract";
import { exportQuerySchema } from "@/modules/campaigns/schemas";

export const contract = defineContract({
  GET: {
    summary: "Export d'une campagne",
    description:
      "xlsx : feuilles Réponses (une ligne par code et destinataire, nombres restés nombres, qualificatif et précision), Groupes, États, Contrôles, Fichiers (métadonnées seulement). csv : feuille Réponses, séparateur `;`, UTF-8 avec BOM. `form` restreint à un questionnaire. Valeurs neutralisées contre l'injection de formules. Journalisé.",
    access: "campaigns:manage",
    accessNote: "dans l'église de la campagne, ou gestionnaire désigné",
    query: exportQuerySchema,
    response: "Classeur ou fichier CSV en pièce jointe",
    responseType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
});
