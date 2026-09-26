import { describe, it, expect } from "vitest";
import { ModuleRegistry, defineModule } from "../module-registry";

const core = defineModule({ name: "core", version: "1.0.0" });
const planning = defineModule({ name: "planning", version: "1.0.0", dependsOn: ["core"] });
const media = defineModule({ name: "media", version: "1.0.0", dependsOn: ["core"], optionalDependencies: ["planning"] });
const discipleship = defineModule({ name: "discipleship", version: "1.0.0", dependsOn: ["core", "planning"] });

describe("ModuleRegistry.register", () => {
  it("enregistre un module", () => {
    const r = new ModuleRegistry();
    r.register(core);
    expect(r.has("core")).toBe(true);
    expect(r.get("core")).toBe(core);
    expect(r.list()).toHaveLength(1);
  });

  it("throw si un module est enregistré deux fois", () => {
    const r = new ModuleRegistry();
    r.register(core);
    expect(() => r.register(core)).toThrow(/déjà enregistré/);
  });
});

describe("ModuleRegistry.validateDependencies", () => {
  it("retourne [] quand toutes les dépendances sont satisfaites", () => {
    const r = new ModuleRegistry();
    r.register(core);
    r.register(planning);
    expect(r.validateDependencies()).toEqual([]);
  });

  it("retourne une erreur quand une dépendance requise manque", () => {
    const r = new ModuleRegistry();
    r.register(planning); // core manquant
    const errors = r.validateDependencies();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Module "planning" dépend de "core"');
  });

  it("ignore les dépendances optionnelles manquantes", () => {
    const r = new ModuleRegistry();
    r.register(core);
    r.register(media); // planning (optional) absent
    expect(r.validateDependencies()).toEqual([]);
  });
});

describe("ModuleRegistry.resolveLoadOrder", () => {
  it("retourne les modules dans l'ordre topologique", () => {
    const r = new ModuleRegistry();
    r.register(discipleship); // ordre d'enregistrement inversé exprès
    r.register(planning);
    r.register(core);

    const order = r.resolveLoadOrder().map((m) => m.name);
    expect(order.indexOf("core")).toBeLessThan(order.indexOf("planning"));
    expect(order.indexOf("planning")).toBeLessThan(order.indexOf("discipleship"));
  });

  it("throw si un cycle est détecté", () => {
    const a = defineModule({ name: "a", version: "1.0.0", dependsOn: ["b"] });
    const b = defineModule({ name: "b", version: "1.0.0", dependsOn: ["a"] });
    const r = new ModuleRegistry();
    r.register(a);
    r.register(b);
    expect(() => r.resolveLoadOrder()).toThrow(/circulaire/);
  });
});

describe("ModuleRegistry.collectPermissions", () => {
  it("agrège les permissions de tous les modules", () => {
    const coreWithPerms = defineModule({
      name: "core",
      version: "1.0.0",
      permissions: { "church:manage": ["SUPER_ADMIN"] },
    });
    const planningWithPerms = defineModule({
      name: "planning",
      version: "1.0.0",
      dependsOn: ["core"],
      permissions: { "planning:view": ["SUPER_ADMIN", "ADMIN"] },
    });

    const r = new ModuleRegistry();
    r.register(coreWithPerms);
    r.register(planningWithPerms);

    const perms = r.collectPermissions();
    expect(perms["church:manage"]).toEqual(["SUPER_ADMIN"]);
    expect(perms["planning:view"]).toEqual(["SUPER_ADMIN", "ADMIN"]);
  });

  it("throw en cas de conflit de permission", () => {
    const m1 = defineModule({
      name: "m1",
      version: "1.0.0",
      permissions: { "x:do": ["ADMIN"] },
    });
    const m2 = defineModule({
      name: "m2",
      version: "1.0.0",
      permissions: { "x:do": ["SUPER_ADMIN"] },
    });

    const r = new ModuleRegistry();
    r.register(m1);
    r.register(m2);

    expect(() => r.collectPermissions()).toThrow(/Conflit de permission "x:do"/);
  });
});

describe("ModuleRegistry.collectNotificationDomains", () => {
  it("agrège les domaines de notification de tous les modules enregistrés", () => {
    const coreWithDomain = defineModule({
      name: "core",
      version: "1.0.0",
      notificationDomains: [{ key: "account", label: "Compte", description: "d", defaultEmail: false }],
    });
    const planningWithDomain = defineModule({
      name: "planning",
      version: "1.0.0",
      dependsOn: ["core"],
      notificationDomains: [{ key: "planning", label: "Planning", description: "d", defaultEmail: true }],
    });

    const r = new ModuleRegistry();
    r.register(coreWithDomain);
    r.register(planningWithDomain);

    const domains = r.collectNotificationDomains();
    expect(domains.map((d) => d.key)).toEqual(expect.arrayContaining(["account", "planning"]));
  });

  it("ignore le domaine d'un module non enregistré (instance sans ce module)", () => {
    const coreWithDomain = defineModule({
      name: "core",
      version: "1.0.0",
      notificationDomains: [{ key: "account", label: "Compte", description: "d", defaultEmail: false }],
    });

    const r = new ModuleRegistry();
    r.register(coreWithDomain);
    // "planning" (et son domaine) n'est jamais enregistré.

    const domains = r.collectNotificationDomains();
    expect(domains).toHaveLength(1);
    expect(domains[0].key).toBe("account");
  });

  it("throw en cas de conflit de clé de domaine entre deux modules", () => {
    const m1 = defineModule({
      name: "m1",
      version: "1.0.0",
      notificationDomains: [{ key: "x", label: "X1", description: "d", defaultEmail: false }],
    });
    const m2 = defineModule({
      name: "m2",
      version: "1.0.0",
      notificationDomains: [{ key: "x", label: "X2", description: "d", defaultEmail: false }],
    });

    const r = new ModuleRegistry();
    r.register(m1);
    r.register(m2);

    expect(() => r.collectNotificationDomains()).toThrow(/Conflit de domaine de notification "x"/);
  });
});
