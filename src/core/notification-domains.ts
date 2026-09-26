import type { ModuleRegistry, NotificationDomainDescriptor } from "./module-registry";

/**
 * Ordre strictement point de code (Sonar S2871), miroir de `src/core/permissions.ts` — un
 * comparateur explicite documente cet ordre sans le changer (celui de `Array.prototype.sort()`
 * sur des chaînes ASCII l'est déjà).
 */
function compareCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Dérive la liste des domaines de notification depuis les manifestes des modules enregistrés
 * (spec 053), triée par clé pour un ordre stable et testable.
 *
 * Source de vérité : `notificationDomains` de chaque `src/modules/{name}/manifest.ts`.
 */
export function buildNotificationDomains(registry: ModuleRegistry): NotificationDomainDescriptor[] {
  return registry
    .collectNotificationDomains()
    .slice()
    .sort((a, b) => compareCodePoint(a.key, b.key));
}
