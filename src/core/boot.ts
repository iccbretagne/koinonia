import { ModuleRegistry, type ModuleManifest } from "./module-registry";

export interface BootOptions {
  modules: ModuleManifest[];
  /** Liste explicite de modules à activer. Si omise, lit process.env.ENABLED_MODULES. */
  enabled?: string[];
}

export function parseEnabledModules(raw: string | undefined): string[] | null {
  if (!raw) return null;
  const list = raw.split(",").map((m) => m.trim()).filter(Boolean);
  return list.length > 0 ? list : null;
}

/**
 * Enregistre les modules activés, valide les dépendances, et retourne un registry prêt.
 * Throw si une dépendance requise manque ou si un cycle est détecté.
 */
export function boot(options: BootOptions): ModuleRegistry {
  const enabled =
    options.enabled ?? parseEnabledModules(process.env.ENABLED_MODULES);

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

  return registry;
}
