import { describe, it, expect } from "vitest";
import { ModuleRegistry, type ModuleManifest } from "@/core/module-registry";
import { coreModule } from "../core/manifest";
import { planningModule } from "../planning/manifest";
import { discipleshipModule } from "../discipleship/manifest";
import { storageModule } from "../storage/manifest";
import { mediaModule } from "../media/manifest";
import { audioModule } from "../audio/manifest";
import { agendaModule } from "../agenda/manifest";
import { roomsModule } from "../rooms/manifest";
import { integrationModule } from "../integration/manifest";
import { accountingModule } from "../accounting/manifest";
import { jobsModule } from "../jobs/manifest";

/**
 * Les 11 modules composés par `src/lib/registry.ts`, importés par leur manifeste et non par leur
 * index : un index re-exporte les services du module, donc Prisma, NextAuth et le client S3 —
 * indisponibles dans l'environnement de test `node`. C'est la raison pour laquelle ce fichier ne
 * couvrait que 3 modules avant l'extraction des manifestes.
 */
const ALL_MODULES: ModuleManifest[] = [
  coreModule,
  planningModule,
  discipleshipModule,
  storageModule,
  mediaModule,
  audioModule,
  agendaModule,
  roomsModule,
  integrationModule,
  accountingModule,
  jobsModule,
];

/** Dépendances déclarées, figées : une arête ajoutée ou retirée doit se voir en revue. */
const EXPECTED_DEPENDENCIES: Record<string, string[]> = {
  core: [],
  planning: ["core"],
  discipleship: ["core", "planning"],
  storage: [],
  media: ["core", "storage"],
  audio: ["core", "storage", "planning"],
  agenda: ["core"],
  rooms: ["core"],
  integration: ["core"],
  accounting: ["core", "planning"],
  jobs: ["core"],
};

/**
 * Propriétaire de chaque permission. `storage` et `integration` n'en déclarent aucune :
 * infrastructure pure pour le premier, accès géré par `requireIntegrationAccess()` pour le second.
 */
const PERMISSION_OWNER: Record<string, string> = {
  "access:manage": "core",
  "church:manage": "core",
  "users:manage": "core",
  "absences:manage": "planning",
  "absences:view": "planning",
  "departments:manage": "planning",
  "departments:view": "planning",
  "events:manage": "planning",
  "events:view": "planning",
  "members:manage": "planning",
  "members:view": "planning",
  "planning:department": "planning",
  "planning:edit": "planning",
  "planning:view": "planning",
  "reports:edit": "planning",
  "reports:view": "planning",
  "discipleship:export": "discipleship",
  "discipleship:manage": "discipleship",
  "discipleship:view": "discipleship",
  "media:manage": "media",
  "media:review": "media",
  "media:upload": "media",
  "media:view": "media",
  "audio:listen": "audio",
  "audio:manage": "audio",
  "audio:review": "audio",
  "audio:upload": "audio",
  "audio:view": "audio",
  "agenda:manage": "agenda",
  "agenda:qualify": "agenda",
  "agenda:view": "agenda",
  "rooms:manage": "rooms",
  "rooms:reserve": "rooms",
  "rooms:view": "rooms",
  "accounting:manage": "accounting",
  "accounting:stats": "accounting",
  "accounting:submit": "accounting",
  "accounting:view": "accounting",
  "jobs:freelance": "jobs",
  "jobs:manage": "jobs",
  "jobs:post": "jobs",
  "jobs:seek": "jobs",
  "jobs:view": "jobs",
};

function buildRegistry(mods: ModuleManifest[] = ALL_MODULES) {
  const r = new ModuleRegistry();
  for (const mod of mods) r.register(mod);
  return r;
}

describe("Manifestes des modules", () => {
  it("couvre les 11 modules composés par le registry", () => {
    expect(ALL_MODULES).toHaveLength(11);
    expect(ALL_MODULES.map((m) => m.name).sort()).toEqual([
      "accounting",
      "agenda",
      "audio",
      "core",
      "discipleship",
      "integration",
      "jobs",
      "media",
      "planning",
      "rooms",
      "storage",
    ]);
  });

  it("s'enregistrent tous sans erreur", () => {
    expect(() => buildRegistry()).not.toThrow();
  });

  it("déclarent un nom unique et une version", () => {
    const names = ALL_MODULES.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    for (const mod of ALL_MODULES) {
      expect(mod.version, `Module ${mod.name}`).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("toutes les dépendances requises sont satisfaites", () => {
    expect(buildRegistry().validateDependencies()).toEqual([]);
  });

  it("les dépendances déclarées correspondent au graphe attendu", () => {
    for (const mod of ALL_MODULES) {
      const deps = [...(mod.dependsOn ?? [])].sort();
      expect(deps, `Module ${mod.name}`).toEqual([...EXPECTED_DEPENDENCIES[mod.name]].sort());
    }
  });

  it("ne dépendent que de modules existants", () => {
    const names = new Set(ALL_MODULES.map((m) => m.name));
    for (const mod of ALL_MODULES) {
      for (const dep of mod.dependsOn ?? []) {
        expect(names.has(dep), `${mod.name} dépend de ${dep}`).toBe(true);
      }
    }
  });

  it("l'ordre de chargement est résolvable et place chaque dépendance avant son dépendant", () => {
    const order = buildRegistry().resolveLoadOrder().map((m) => m.name);
    expect(order).toHaveLength(11);

    for (const mod of ALL_MODULES) {
      for (const dep of mod.dependsOn ?? []) {
        expect(
          order.indexOf(dep),
          `${dep} doit être chargé avant ${mod.name}`
        ).toBeLessThan(order.indexOf(mod.name));
      }
    }
  });

  it("aucun conflit de permission entre les modules", () => {
    expect(() => buildRegistry().collectPermissions()).not.toThrow();
  });

  it("chaque permission est déclarée par un seul module, celui attendu", () => {
    for (const mod of ALL_MODULES) {
      for (const perm of Object.keys(mod.permissions ?? {})) {
        expect(PERMISSION_OWNER[perm], `Permission ${perm}`).toBe(mod.name);
      }
    }
    // Et réciproquement : la table ne décrit pas de permission fantôme.
    const declared = new Set(ALL_MODULES.flatMap((m) => Object.keys(m.permissions ?? {})));
    expect([...declared].sort()).toEqual(Object.keys(PERMISSION_OWNER).sort());
  });

  it("la somme des permissions correspond à la matrice RBAC des 11 modules", () => {
    const permNames = Object.keys(buildRegistry().collectPermissions()).sort();
    expect(permNames).toEqual(Object.keys(PERMISSION_OWNER).sort());
  });

  it("les permissions suivent la convention `domaine:action`", () => {
    for (const perm of Object.keys(buildRegistry().collectPermissions())) {
      expect(perm, `Permission ${perm}`).toMatch(/^[a-z]+:[a-z]+$/);
    }
  });

  it("storage et integration ne déclarent aucune permission", () => {
    expect(Object.keys(storageModule.permissions ?? {})).toEqual([]);
    expect(Object.keys(integrationModule.permissions ?? {})).toEqual([]);
  });

  it("core ne déclare que des permissions globales", () => {
    expect(Object.keys(coreModule.permissions ?? {}).sort()).toEqual([
      "access:manage",
      "church:manage",
      "users:manage",
    ]);
  });

  it("chaque entrée de navigation référence une permission déclarée", () => {
    const known = new Set(Object.keys(buildRegistry().collectPermissions()));

    for (const mod of ALL_MODULES) {
      for (const entry of mod.navigation ?? []) {
        expect(entry.label, `Module ${mod.name}`).toBeTruthy();
        expect(entry.href, `Module ${mod.name} / ${entry.label}`).toMatch(/^\//);
        if (entry.permission) {
          expect(
            known.has(entry.permission),
            `${mod.name} / ${entry.label} → permission inconnue « ${entry.permission} »`
          ).toBe(true);
        }
      }
    }
  });

  it("un module chargé sans sa dépendance échoue à la validation", () => {
    for (const mod of ALL_MODULES.filter((m) => (m.dependsOn ?? []).length > 0)) {
      const r = new ModuleRegistry();
      r.register(mod);
      const errors = r.validateDependencies();
      expect(errors.length, `Module ${mod.name}`).toBeGreaterThan(0);
      expect(errors.join("\n"), `Module ${mod.name}`).toContain(`"${mod.name}"`);
    }
  });

  it("discipleship sans planning échoue à la validation", () => {
    const r = new ModuleRegistry();
    r.register(coreModule);
    r.register(discipleshipModule);
    expect(r.validateDependencies().some((e) => e.includes('"planning"'))).toBe(true);
  });

  it("audio sans storage échoue à la validation", () => {
    const r = new ModuleRegistry();
    r.register(coreModule);
    r.register(planningModule);
    r.register(audioModule);
    expect(r.validateDependencies().some((e) => e.includes('"storage"'))).toBe(true);
  });
});
