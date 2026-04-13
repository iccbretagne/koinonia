import { describe, it, expect } from "vitest";
import { ModuleRegistry } from "@/core/module-registry";
import { coreModule } from "../core";
import { planningModule } from "../planning";
import { discipleshipModule } from "../discipleship";

const ALL_MODULES = [coreModule, planningModule, discipleshipModule];

function buildRegistry(mods = ALL_MODULES) {
  const r = new ModuleRegistry();
  for (const mod of mods) r.register(mod);
  return r;
}

describe("Manifestes des modules", () => {
  it("s'enregistrent sans erreur", () => {
    expect(() => buildRegistry()).not.toThrow();
  });

  it("toutes les dépendances requises sont satisfaites", () => {
    const errors = buildRegistry().validateDependencies();
    expect(errors).toEqual([]);
  });

  it("l'ordre de chargement est résolvable sans cycle", () => {
    const order = buildRegistry().resolveLoadOrder().map((m) => m.name);
    expect(order.indexOf("core")).toBeLessThan(order.indexOf("planning"));
    expect(order.indexOf("core")).toBeLessThan(order.indexOf("discipleship"));
    expect(order.indexOf("planning")).toBeLessThan(order.indexOf("discipleship"));
  });

  it("aucun conflit de permission entre les modules", () => {
    expect(() => buildRegistry().collectPermissions()).not.toThrow();
  });

  it("la somme des permissions correspond à la matrice RBAC actuelle", () => {
    const perms = buildRegistry().collectPermissions();
    const permNames = Object.keys(perms).sort();

    expect(permNames).toEqual([
      "church:manage",
      "departments:manage",
      "departments:view",
      "discipleship:export",
      "discipleship:manage",
      "discipleship:view",
      "events:manage",
      "events:view",
      "members:manage",
      "members:view",
      "planning:edit",
      "planning:view",
      "reports:edit",
      "reports:view",
      "users:manage",
    ]);
  });

  it("core gère les permissions globales uniquement", () => {
    const corePerms = Object.keys(coreModule.permissions ?? {});
    expect(corePerms).toContain("church:manage");
    expect(corePerms).toContain("users:manage");
    expect(corePerms).not.toContain("planning:view");
  });

  it("planning sans core échoue à la validation", () => {
    const r = new ModuleRegistry();
    r.register(planningModule);
    const errors = r.validateDependencies();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('"planning"');
    expect(errors[0]).toContain('"core"');
  });

  it("discipleship sans planning échoue à la validation", () => {
    const r = new ModuleRegistry();
    r.register(coreModule);
    r.register(discipleshipModule);
    const errors = r.validateDependencies();
    expect(errors.some((e) => e.includes('"planning"'))).toBe(true);
  });
});
