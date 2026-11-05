import { defineModule } from "@/core/module-registry";

/**
 * Module assistant — assistant de prise en main (spec 075, ADR-0028).
 *
 * Périmètre :
 *   - Base de connaissances : fiches fournies dans le code (`knowledge/`), ajouts et
 *     corrections du Super Admin en base, fusionnés à la lecture
 *   - Moteur de réponse interchangeable (`AnswerEngine`) : recherche hybride (sens + mots),
 *     sans aucun service externe
 *   - Questions de données : fournies par chaque module (contrat `src/core/assistant.ts`) et
 *     composées dans `src/app` ; ce module n'importe aucun autre module
 *   - Questions à traiter (anonymes, d'instance), compteurs d'usage, résumé hebdomadaire
 *
 * Accès : tout compte connecté de l'église (si l'assistant est actif) ; administration
 * réservée au Super Admin ; coupure par église avec `church:settings`. Aucune permission propre.
 */
export const assistantModule = defineModule({
  name: "assistant",
  version: "1.0.0",
  dependsOn: ["core"],

  routes: {
    authenticated: [{ path: "/admin/assistant" }],
    api: [{ path: "/api/assistant" }],
  },

  notificationDomains: [
    {
      key: "assistant",
      label: "Assistant",
      description: "Questions posées à l'assistant qui attendent une réponse dans la base.",
      defaultEmail: true,
      visibleWith: ["church:manage"],
    },
  ],
});
