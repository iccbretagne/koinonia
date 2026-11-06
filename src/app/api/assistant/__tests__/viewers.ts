import type { AssistantViewer } from "@/core/assistant";
import { ModuleRegistry } from "@/core/module-registry";
import { buildRolePermissions } from "@/core/permissions";
import { allManifests } from "@/lib/manifests";

/** Matrice réelle des permissions, depuis les manifestes (sans Prisma). */
const registry = new ModuleRegistry();
for (const m of allManifests) registry.register(m);
export const ROLE_PERMISSIONS = buildRolePermissions(registry);
export const ALL_MODULES = allManifests.map((m) => m.name);

/** Viewer de test pour un rôle dans l'église courante. */
export function viewerFor(
  role: string,
  options: { predicates?: string[]; modules?: string[]; isSuperAdmin?: boolean } = {}
): AssistantViewer {
  return {
    userId: "user-1",
    churchId: "church-1",
    churchName: "Église de démonstration",
    churchCount: 1,
    isSuperAdmin: options.isSuperAdmin ?? role === "SUPER_ADMIN",
    roles: [role],
    permissions: ROLE_PERMISSIONS[role] ?? [],
    predicates: options.predicates ?? [],
    modules: options.modules ?? ALL_MODULES,
  };
}
