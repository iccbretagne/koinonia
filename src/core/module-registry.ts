import type { Prisma } from "@/generated/prisma/client";

export type Permission = string;
export type RoleName = string;

export interface RouteDescriptor {
  path: string;
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
}

export function defineModule(manifest: ModuleManifest): ModuleManifest {
  return manifest;
}

export class ModuleRegistry {
  private modules = new Map<string, ModuleManifest>();

  register(module: ModuleManifest): void {
    if (this.modules.has(module.name)) {
      throw new Error(`Module "${module.name}" déjà enregistré`);
    }
    this.modules.set(module.name, module);
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
    for (const module of this.modules.values()) {
      for (const dep of module.dependsOn ?? []) {
        if (!this.modules.has(dep)) {
          errors.push(`Module "${module.name}" dépend de "${dep}" qui n'est pas enregistré`);
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
      const module = this.modules.get(name);
      if (!module) return;
      visiting.add(name);
      for (const dep of module.dependsOn ?? []) {
        visit(dep);
      }
      visiting.delete(name);
      visited.add(name);
      sorted.push(module);
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

    for (const module of this.modules.values()) {
      for (const [perm, roles] of Object.entries(module.permissions ?? {})) {
        if (owners.has(perm)) {
          throw new Error(
            `Conflit de permission "${perm}" entre les modules "${owners.get(perm)}" et "${module.name}"`
          );
        }
        owners.set(perm, module.name);
        result[perm] = roles;
      }
    }

    return result;
  }
}
