import { defineModule } from "@/core/module-registry";

export { integrationBus } from "./bus";
export type { IntegrationEvents } from "./events";
export { requireIntegrationAccess, isIntegrationMember } from "./auth";
export type { IntegrationScope } from "./auth";
export {
  buildConfirmationEmail,
  buildBergerNotifEmail,
  buildInactivityEmail,
  notifyBergerAssigned,
  runInactivityNotifications,
} from "./services/family-service";

/**
 * Module intégration — suivi des parcours d'intégration.
 *
 * Périmètre :
 *   - Demandes d'intégration aux familles
 *   - Suivi MSDP des nouveaux convertis (appel au salut)
 *   - Affectation bergers et conseillers MSDP
 *   - KPIs et statistiques
 *
 * Dépendances : core (obligatoire)
 */
export const integrationModule = defineModule({
  name: "integration",
  version: "1.0.0",
  dependsOn: ["core"],
  permissions: {},
});
