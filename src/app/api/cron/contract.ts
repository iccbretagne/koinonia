import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Exécution des tâches planifiées",
    description: "Appelée toutes les 5 minutes par le minuteur système ; chaque tâche ne s'exécute que lorsqu'elle est due (ADR-0021). Tâches : rappels de service J-1 et J-3, récapitulatif des changements au secrétariat, relances d'intégration et de soins pastoraux, cycle de vie des offres d'emploi, collecte des disponibilités (spec 058), récapitulatifs de changements de planning (spec 060) et relance des services à remplacer (spec 061). Les tâches d'un module désactivé ne sont pas exécutées.",
    access: "cron",
    accessNote: "en-tête `Authorization: Bearer <CRON_SECRET>` (401 sinon)",
    response: "Statut de chaque tâche (`tasks`) et résultat de celles exécutées",
  },
});
