import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Présences d'un événement",
    description:
      "Compteur calculé à partir des passages (participants, dont mineurs ; équipe et intervenants à part ; comptage manuel), seuil de jauge (0, 90, 100), mineurs non accompagnés présents avec le téléphone du responsable, anomalies, courbe par quart d'heure.",
    access: "session",
    accessNote: "un rôle de lecture sur l'événement",
    response: "Présences",
  },
});
