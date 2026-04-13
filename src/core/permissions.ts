import type { ModuleRegistry } from "./module-registry";

/**
 * Dérive la matrice rôles → permissions depuis les manifestes des modules enregistrés.
 *
 * Inverse la structure `permissions` des modules (permission → roles[])
 * pour produire un Record<role, permission[]> utilisable par le système d'autorisation.
 *
 * Source de vérité : les manifestes dans src/modules/{name}/index.ts
 * Remplace à terme : src/lib/permissions.ts (ROLE_PERMISSIONS)
 */
export function buildRolePermissions(
  registry: ModuleRegistry
): Record<string, string[]> {
  const rolePerms = new Map<string, Set<string>>();

  for (const mod of registry.list()) {
    for (const [permission, roles] of Object.entries(mod.permissions ?? {})) {
      for (const role of roles) {
        if (!rolePerms.has(role)) rolePerms.set(role, new Set());
        rolePerms.get(role)!.add(permission);
      }
    }
  }

  return Object.fromEntries(
    Array.from(rolePerms.entries()).map(([role, perms]) => [
      role,
      Array.from(perms).sort(),
    ])
  );
}

/**
 * Vérifie si un rôle possède une permission donnée,
 * en utilisant la matrice construite depuis les modules.
 */
export function roleHasPermission(
  registry: ModuleRegistry,
  role: string,
  permission: string
): boolean {
  const matrix = buildRolePermissions(registry);
  return matrix[role]?.includes(permission) ?? false;
}
