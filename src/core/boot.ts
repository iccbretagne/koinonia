import { ModuleRegistry, type ModuleManifest } from "./module-registry";

/**
 * Ordre strictement point de code (Sonar S2871) — ces noms de modules servent de clé
 * déterministe dans des messages d'erreur et un test figé (`boot.test.ts`) ; l'ordre par
 * défaut de `Array.prototype.sort()` sur des chaînes ASCII est déjà celui des points de code,
 * ce comparateur explicite le documente sans changer le résultat.
 */
function compareCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface BootOptions {
  modules: ModuleManifest[];
  /** Liste explicite de modules à activer. Si omise, lit process.env.ENABLED_MODULES. */
  enabled?: string[];
  /** Coupe le journal d'une ligne des modules actifs (silence les tests). */
  quiet?: boolean;
}

export function parseEnabledModules(raw: string | undefined): string[] | null {
  if (!raw) return null;
  const list = raw.split(",").map((m) => m.trim()).filter(Boolean);
  return list.length > 0 ? list : null;
}

/**
 * Module racine : seul module non désactivable (spec 038). Porte la gestion des églises,
 * des comptes et des accès — sans lui l'instance serait inadministrable.
 */
export const ROOT_MODULE = "core";

/**
 * Enregistre les modules activés, valide les dépendances, et retourne un registry prêt.
 * Throw (démarrage refusé, fail-fast — spec 038) si :
 *   - le module racine (`ROOT_MODULE`) est absent de la liste activée ;
 *   - `ENABLED_MODULES` nomme un module qui n'existe pas (faute de frappe = désactivation
 *     silencieuse aujourd'hui, jamais signalée — c'est le même défaut de fond que celui
 *     que cette fonctionnalité corrige) ;
 *   - une dépendance requise manque, ou un cycle est détecté (validations préexistantes).
 */
export function boot(options: BootOptions): ModuleRegistry {
  const enabled =
    options.enabled ?? parseEnabledModules(process.env.ENABLED_MODULES);

  if (enabled) {
    const knownNames = new Set(options.modules.map((m) => m.name));
    const unknown = enabled.filter((name) => !knownNames.has(name));
    if (unknown.length > 0) {
      throw new Error(
        `Boot échoué : module(s) inconnu(s) dans ENABLED_MODULES : ${unknown.join(", ")}. ` +
          `Modules disponibles : ${[...knownNames].sort(compareCodePoint).join(", ")}.`
      );
    }
    if (!enabled.includes(ROOT_MODULE)) {
      throw new Error(
        `Boot échoué : le module racine "${ROOT_MODULE}" est absent de ENABLED_MODULES. ` +
          `Sans lui l'instance ne peut ni créer d'église ni attribuer d'accès — il n'est pas désactivable.`
      );
    }
  }

  const registry = new ModuleRegistry();

  const toLoad = enabled
    ? options.modules.filter((m) => enabled.includes(m.name))
    : options.modules;

  for (const mod of toLoad) {
    registry.register(mod);
  }

  const errors = registry.validateDependencies();
  if (errors.length > 0) {
    throw new Error(`Boot échoué :\n${errors.join("\n")}`);
  }

  // Valide qu'aucun cycle n'existe
  registry.resolveLoadOrder();

  if (!options.quiet) {
    // Seul point de diagnostic de la configuration effective (spec 038, question ouverte
    // 1) : pas de point exposé côté application, un exploitant a déjà accès aux journaux.
    // src/core reste framework-agnostic, sans dépendance à src/lib/logger (pino) pour une
    // seule ligne au démarrage du process.
    console.log(`[boot] modules actifs : ${registry.list().map((m) => m.name).sort(compareCodePoint).join(", ")}`);
  }

  return registry;
}
