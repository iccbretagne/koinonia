import { describe, it, expect } from "vitest";
import { ModuleRegistry } from "../module-registry";
import { buildNotificationDomains } from "../notification-domains";
import { coreModule } from "@/modules/core/manifest";
import { planningModule } from "@/modules/planning/manifest";
import { careModule } from "@/modules/care/manifest";
import { jobsModule } from "@/modules/jobs/manifest";

/**
 * Manifestes importés directement (pas via l'index du module) — voir `permissions.test.ts` : ne
 * dépendent que de `defineModule`, utilisables dans l'environnement de test `node`.
 */
describe("buildNotificationDomains", () => {
  it("agrège et trie par clé, sans doublon, les domaines des modules enregistrés", () => {
    const r = new ModuleRegistry();
    r.register(coreModule);
    r.register(planningModule);
    r.register(careModule);
    r.register(jobsModule);

    const domains = buildNotificationDomains(r);
    const keys = domains.map((d) => d.key);

    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(["account", "planning", "requests", "care", "jobs"]));
  });

  it("le domaine d'un module absent de l'instance n'apparaît pas", () => {
    const r = new ModuleRegistry();
    r.register(coreModule);
    r.register(planningModule);
    // "care" et "jobs" ne sont pas enregistrés — instance sans ces modules.

    const domains = buildNotificationDomains(r);
    const keys = domains.map((d) => d.key);

    expect(keys).not.toContain("care");
    expect(keys).not.toContain("jobs");
  });
});
