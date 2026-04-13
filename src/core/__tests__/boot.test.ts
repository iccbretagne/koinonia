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

  it("throw si une dépendance requise manque après filtrage", () => {
    expect(() =>
      boot({ modules: [core, planning], enabled: ["planning"] })
    ).toThrow(/Module "planning" dépend de "core"/);
  });

  it("accepte une dépendance optionnelle absente", () => {
    const registry = boot({ modules: [core, media], enabled: ["core", "media"] });
    expect(registry.has("media")).toBe(true);
  });

  it("throw si un cycle est détecté", () => {
    const a = defineModule({ name: "a", version: "1.0.0", dependsOn: ["b"] });
    const b = defineModule({ name: "b", version: "1.0.0", dependsOn: ["a"] });
    expect(() => boot({ modules: [a, b] })).toThrow(/circulaire/);
  });
});
