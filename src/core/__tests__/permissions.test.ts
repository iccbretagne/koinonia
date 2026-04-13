import { describe, it, expect } from "vitest";
import { ModuleRegistry } from "../module-registry";
import { buildRolePermissions, roleHasPermission } from "../permissions";
import { coreModule } from "@/modules/core";
import { planningModule } from "@/modules/planning";
import { discipleshipModule } from "@/modules/discipleship";
// Matrice de référence (source de vérité actuelle)
import { hasPermission } from "@/lib/permissions";
import type { Role } from "@/generated/prisma/client";

const ALL_ROLES: Role[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "SECRETARY",
  "MINISTER",
  "DEPARTMENT_HEAD",
  "DISCIPLE_MAKER",
  "REPORTER",
];

function buildFullRegistry() {
  const r = new ModuleRegistry();
  r.register(coreModule);
  r.register(planningModule);
  r.register(discipleshipModule);
  return r;
}

describe("buildRolePermissions", () => {
  it("produit un résultat identique à la matrice ROLE_PERMISSIONS actuelle", () => {
    const registry = buildFullRegistry();
    const matrix = buildRolePermissions(registry);

    for (const role of ALL_ROLES) {
      const fromModules = (matrix[role] ?? []).sort();
      const fromLib = hasPermission(role).sort();

      expect(fromModules, `Rôle ${role}`).toEqual(fromLib);
    }
  });

  it("retourne un tableau vide pour un rôle inconnu", () => {
    const matrix = buildRolePermissions(buildFullRegistry());
    expect(matrix["UNKNOWN_ROLE"]).toBeUndefined();
  });

  it("les permissions sont triées par ordre alphabétique", () => {
    const matrix = buildRolePermissions(buildFullRegistry());
    for (const [role, perms] of Object.entries(matrix)) {
      expect(perms, `Rôle ${role}`).toEqual([...perms].sort());
    }
  });
});

describe("roleHasPermission", () => {
  it("SUPER_ADMIN a toutes les permissions", () => {
    const registry = buildFullRegistry();
    const allPerms = registry.collectPermissions();
    for (const perm of Object.keys(allPerms)) {
      expect(roleHasPermission(registry, "SUPER_ADMIN", perm)).toBe(true);
    }
  });

  it("REPORTER n'a pas planning:view", () => {
    expect(roleHasPermission(buildFullRegistry(), "REPORTER", "planning:view")).toBe(false);
  });

  it("REPORTER a reports:view", () => {
    expect(roleHasPermission(buildFullRegistry(), "REPORTER", "reports:view")).toBe(true);
  });

  it("DISCIPLE_MAKER n'a pas planning:edit", () => {
    expect(roleHasPermission(buildFullRegistry(), "DISCIPLE_MAKER", "planning:edit")).toBe(false);
  });

  it("retourne false pour un rôle ou permission inconnus", () => {
    const registry = buildFullRegistry();
    expect(roleHasPermission(registry, "UNKNOWN", "planning:view")).toBe(false);
    expect(roleHasPermission(registry, "ADMIN", "unknown:perm")).toBe(false);
  });
});
