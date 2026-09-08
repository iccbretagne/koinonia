import { describe, it, expect } from "vitest";
import { boot, parseEnabledModules } from "../boot";
import { defineModule } from "../module-registry";

const core = defineModule({ name: "core", version: "1.0.0" });
const planning = defineModule({ name: "planning", version: "1.0.0", dependsOn: ["core"] });
const media = defineModule({ name: "media", version: "1.0.0", dependsOn: ["core"], optionalDependencies: ["planning"] });

describe("parseEnabledModules", () => {
  it("retourne null pour une valeur vide", () => {
    expect(parseEnabledModules(undefined)).toBeNull();
    expect(parseEnabledModules("")).toBeNull();
    expect(parseEnabledModules("  ")).toBeNull();
  });

  it("parse une liste séparée par des virgules en trimmant", () => {
    expect(parseEnabledModules("core,planning,media")).toEqual(["core", "planning", "media"]);
    expect(parseEnabledModules("core, planning , media")).toEqual(["core", "planning", "media"]);
  });
});

describe("boot", () => {
  it("enregistre tous les modules si aucun filtre n'est fourni", () => {
    const registry = boot({ modules: [core, planning, media] });
    expect(registry.list()).toHaveLength(3);
  });

  it("filtre les modules selon la liste enabled", () => {
    const registry = boot({ modules: [core, planning, media], enabled: ["core", "media"] });
    expect(registry.has("core")).toBe(true);
    expect(registry.has("media")).toBe(true);
    expect(registry.has("planning")).toBe(false);
  });

  it("throw si une dépendance requise manque après filtrage (dépendance autre que le module racine)", () => {
    // "media" dépend de "core" (présent) — la dépendance qui manque ici est "planning",
    // requise par un module fictif "extra", pour ne pas se confondre avec la validation
    // du module racine (voir tests dédiés ci-dessous).
    const extra = defineModule({ name: "extra", version: "1.0.0", dependsOn: ["core", "planning"] });
    expect(() =>
      boot({ modules: [core, planning, extra], enabled: ["core", "extra"] })
    ).toThrow(/Module "extra" dépend de "planning"/);
  });

  it("accepte une dépendance optionnelle absente", () => {
    const registry = boot({ modules: [core, media], enabled: ["core", "media"] });
    expect(registry.has("media")).toBe(true);
  });

  it("throw si un cycle est détecté", () => {
    const a = defineModule({ name: "a", version: "1.0.0", dependsOn: ["b", "core"] });
    const b = defineModule({ name: "b", version: "1.0.0", dependsOn: ["a"] });
    expect(() => boot({ modules: [core, a, b] })).toThrow(/circulaire/);
  });
});

describe("boot — validations spec 038 (modules optionnels par déploiement)", () => {
  it("démarre sans liste et active tous les modules (CA : aucune liste fournie)", () => {
    const registry = boot({ modules: [core, planning, media] });
    expect(registry.list().map((m) => m.name).sort()).toEqual(["core", "media", "planning"]);
  });

  it("throw si le module racine est absent de la liste, en le nommant (CA : racine désactivée)", () => {
    expect(() => boot({ modules: [core, planning], enabled: ["planning"] })).toThrow(
      /module racine "core" est absent/
    );
  });

  it("démarre avec le seul module racine actif, produisant une instance réduite à l'administration (CA)", () => {
    const registry = boot({ modules: [core, planning, media], enabled: ["core"] });
    expect(registry.list()).toHaveLength(1);
    expect(registry.has("core")).toBe(true);
  });

  it("throw et nomme le(s) module(s) inconnu(s) de ENABLED_MODULES", () => {
    expect(() =>
      boot({ modules: [core, planning], enabled: ["core", "audeo"] })
    ).toThrow(/module\(s\) inconnu\(s\).*audeo/);
  });

  it("throw sur un module inconnu avant même de vérifier le module racine", () => {
    // Une faute de frappe sur ENABLED_MODULES ne doit jamais désactiver silencieusement
    // un module (c'est le défaut de fond que spec 038 corrige) — même quand "core" est
    // par ailleurs bien présent dans la liste.
    expect(() =>
      boot({ modules: [core, planning], enabled: ["core", "planing"] })
    ).toThrow(/module\(s\) inconnu\(s\).*planing/);
  });
});
