import type { Prisma } from "@/generated/prisma/client";

export type Permission = string;
export type RoleName = string;

export interface RouteDescriptor {
  path: string;
  /**
   * Restreint une entrée `routes.public` à une méthode HTTP (ex. "POST" pour un
   * formulaire de soumission publique dont la consultation, elle, reste protégée).
   * Absent = toutes méthodes. Sans effet sur `routes.authenticated`/`routes.api`
   * (l'appartenance à un module ne dépend pas de la méthode).
   */
  method?: string;
}

export interface NavigationItem {
  label: string;
  icon?: string;
  href: string;
  permission?: Permission;
}

export interface JobDescriptor {
  name: string;
  schedule: string;
  handler: (ctx: { tx: Prisma.TransactionClient }) => Promise<void>;
}

/**
 * Domaine de notification (spec 053) : regroupe les notifications d'un module pour le
 * réglage des préférences email (« Mes notifications »). Une clé de domaine se déclare sans
 * migration de schéma — `Notification.domain` et `NotificationEmailPreference.domain` sont de
 * simples chaînes, validées contre ce registre à l'écriture (Zod côté API), pas par un enum.
 */
export interface NotificationDomainDescriptor {
  /** Identifiant stable, unique entre tous les modules actifs (ex. "planning", "care"). */
  key: string;
  /** Libellé affiché sur la page de préférences (ex. « Planning et service »). */
  label: string;
  /** Phrase d'exemples affichée sous le libellé (ex. « ajout ou retrait d'un service… »). */
  description: string;
  /**
   * Valeur effective quand l'utilisateur n'a jamais réglé ce domaine. Vrai pour un domaine qui
   * envoie déjà des emails aujourd'hui (même partiellement) — la mise en service de la spec 053
   * ne doit retirer aucun email à personne.
   */
  defaultEmail: boolean;
  /**
   * Le domaine n'est proposé sur la page que si l'utilisateur détient l'une de ces permissions
   * dans au moins une de ses églises, ou a déjà reçu une notification de ce domaine. Omis =
   * toujours affiché (ex. le domaine "account", qui concerne tout le monde).
   */
  visibleWith?: readonly Permission[];
}

export interface ModuleRoutes {
  authenticated?: RouteDescriptor[];
  public?: RouteDescriptor[];
  api?: RouteDescriptor[];
}

export interface ModuleManifest {
  name: string;
  version: string;
  dependsOn?: readonly string[];
  optionalDependencies?: readonly string[];
  routes?: ModuleRoutes;
  permissions?: Record<Permission, readonly RoleName[]>;
  navigation?: NavigationItem[];
  jobs?: JobDescriptor[];
  notificationDomains?: NotificationDomainDescriptor[];
}

export function defineModule(manifest: ModuleManifest): ModuleManifest {
  return manifest;
}

export class ModuleRegistry {
  private modules = new Map<string, ModuleManifest>();

  register(mod: ModuleManifest): void {
    if (this.modules.has(mod.name)) {
      throw new Error(`Module "${mod.name}" déjà enregistré`);
    }
    this.modules.set(mod.name, mod);
  }

  get(name: string): ModuleManifest | undefined {
    return this.modules.get(name);
  }

  has(name: string): boolean {
    return this.modules.has(name);
  }

  list(): ModuleManifest[] {
    return Array.from(this.modules.values());
  }

  /**
   * Vérifie que toutes les dépendances requises sont satisfaites.
   * Retourne les erreurs détectées sans throw.
   */
  validateDependencies(): string[] {
    const errors: string[] = [];
    for (const mod of this.modules.values()) {
      for (const dep of mod.dependsOn ?? []) {
        if (!this.modules.has(dep)) {
          errors.push(`Module "${mod.name}" dépend de "${dep}" qui n'est pas enregistré`);
        }
      }
    }
    return errors;
  }

  /**
   * Retourne les modules dans l'ordre de chargement (tri topologique).
   * Throw si un cycle est détecté.
   */
  resolveLoadOrder(): ModuleManifest[] {
    const sorted: ModuleManifest[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (name: string) => {
      if (visited.has(name)) return;
      if (visiting.has(name)) {
        throw new Error(`Dépendance circulaire détectée impliquant le module "${name}"`);
      }
      const mod = this.modules.get(name);
      if (!mod) return;
      visiting.add(name);
      for (const dep of mod.dependsOn ?? []) {
        visit(dep);
      }
      visiting.delete(name);
      visited.add(name);
      sorted.push(mod);
    };

    for (const name of this.modules.keys()) {
      visit(name);
    }

    return sorted;
  }

  /**
   * Agrège les permissions déclarées par tous les modules enregistrés.
   * Throw si deux modules déclarent la même permission (conflit).
   */
  collectPermissions(): Record<Permission, readonly RoleName[]> {
    const result: Record<Permission, readonly RoleName[]> = {};
    const owners = new Map<Permission, string>();

    for (const mod of this.modules.values()) {
      for (const [perm, roles] of Object.entries(mod.permissions ?? {})) {
        if (owners.has(perm)) {
          throw new Error(
            `Conflit de permission "${perm}" entre les modules "${owners.get(perm)}" et "${mod.name}"`
          );
        }
        owners.set(perm, mod.name);
        result[perm] = roles;
      }
    }

    return result;
  }

  /**
   * Agrège les domaines de notification déclarés par tous les modules enregistrés (spec 053).
   * Throw si deux modules déclarent la même clé — miroir de `collectPermissions()`.
   */
  collectNotificationDomains(): NotificationDomainDescriptor[] {
    const result: NotificationDomainDescriptor[] = [];
    const owners = new Map<string, string>();

    for (const mod of this.modules.values()) {
      for (const domain of mod.notificationDomains ?? []) {
        if (owners.has(domain.key)) {
          throw new Error(
            `Conflit de domaine de notification "${domain.key}" entre les modules "${owners.get(domain.key)}" et "${mod.name}"`
          );
        }
        owners.set(domain.key, mod.name);
        result.push(domain);
      }
    }

    return result;
  }
}
