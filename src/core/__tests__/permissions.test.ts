import { describe, it, expect } from "vitest";
import { ModuleRegistry } from "../module-registry";
import { buildRolePermissions, roleHasPermission } from "../permissions";
import { coreModule } from "@/modules/core/manifest";
import { planningModule } from "@/modules/planning/manifest";
import { discipleshipModule } from "@/modules/discipleship/manifest";
import { storageModule } from "@/modules/storage/manifest";
import { mediaModule } from "@/modules/media/manifest";
import { audioModule } from "@/modules/audio/manifest";
import { agendaModule } from "@/modules/agenda/manifest";
import { roomsModule } from "@/modules/rooms/manifest";
import { integrationModule } from "@/modules/integration/manifest";
import { accountingModule } from "@/modules/accounting/manifest";
import { jobsModule } from "@/modules/jobs/manifest";
import type { Role } from "@/generated/prisma/client";

/**
 * Les 11 modules du registry (`src/lib/registry.ts`), importés par leur manifeste et non par
 * leur index : un index re-exporte les services du module, donc Prisma, NextAuth et le client
 * S3 — indisponibles dans l'environnement de test `node`. Le manifeste, lui, ne dépend que de
 * `defineModule`.
 */
const ALL_MODULES = [
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

/** Les 10 rôles de l'enum Prisma `Role`. */
const ALL_ROLES: Role[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "SECRETARY",
  "MINISTER",
  "DEPARTMENT_HEAD",
  "DISCIPLE_MAKER",
  "REPORTER",
  "STAR",
  "AGENDA_QUALIFIER",
  "ACCOUNTANT",
];

/**
 * Matrice RBAC de référence, FIGÉE EN DUR.
 *
 * Elle remplace l'ancien import de `hasPermission` (`src/lib/permissions.ts`, supprimé) : ce
 * helper déprécié ne connaissait que 4 modules sur 11 et ne servait plus qu'à ce test, qui se
 * comparait donc à une source de vérité périmée.
 *
 * Toute modification d'un manifeste qui change les droits d'un rôle fait échouer ce test. C'est
 * volontaire : la mise à jour de cette matrice est l'endroit où le changement de droits devient
 * visible en revue. Tenir `docs/auth.md` et le tableau de `CLAUDE.md` alignés dans le même
 * commit.
 */
const EXPECTED_MATRIX: Record<Role, string[]> = {
  SUPER_ADMIN: [
    "absences:manage",
    "absences:view",
    "access:manage",
    "accounting:manage",
    "accounting:stats",
    "accounting:submit",
    "accounting:view",
    "agenda:manage",
    "agenda:qualify",
    "agenda:view",
    "audio:listen",
    "audio:manage",
    "audio:review",
    "audio:upload",
    "audio:view",
    "church:manage",
    "departments:manage",
    "departments:view",
    "discipleship:export",
    "discipleship:manage",
    "discipleship:view",
    "events:manage",
    "events:view",
    "jobs:freelance",
    "jobs:manage",
    "jobs:post",
    "jobs:seek",
    "jobs:view",
    "media:manage",
    "media:review",
    "media:upload",
    "media:view",
    "members:manage",
    "members:view",
    "planning:department",
    "planning:edit",
    "planning:view",
    "reports:edit",
    "reports:view",
    "rooms:manage",
    "rooms:reserve",
    "rooms:view",
    "users:manage",
  ],
  ADMIN: [
    "absences:manage",
    "absences:view",
    "access:manage",
    "accounting:manage",
    "accounting:stats",
    "accounting:submit",
    "accounting:view",
    "agenda:manage",
    "agenda:qualify",
    "agenda:view",
    "audio:listen",
    "audio:manage",
    "audio:review",
    "audio:upload",
    "audio:view",
    "departments:manage",
    "departments:view",
    "discipleship:manage",
    "discipleship:view",
    "events:manage",
    "events:view",
    "jobs:freelance",
    "jobs:manage",
    "jobs:post",
    "jobs:seek",
    "jobs:view",
    "media:manage",
    "media:review",
    "media:upload",
    "media:view",
    "members:manage",
    "members:view",
    "planning:department",
    "planning:edit",
    "planning:view",
    "reports:edit",
    "reports:view",
    "rooms:manage",
    "rooms:reserve",
    "rooms:view",
  ],
  SECRETARY: [
    "absences:manage",
    "absences:view",
    "access:manage",
    "accounting:stats",
    "agenda:manage",
    "agenda:view",
    "audio:listen",
    "audio:upload",
    "audio:view",
    "departments:view",
    "discipleship:export",
    "discipleship:manage",
    "discipleship:view",
    "events:manage",
    "events:view",
    "jobs:freelance",
    "jobs:manage",
    "jobs:post",
    "jobs:seek",
    "jobs:view",
    "media:upload",
    "media:view",
    "members:view",
    "planning:department",
    "planning:view",
    "reports:edit",
    "reports:view",
    "rooms:view",
  ],
  MINISTER: [
    "absences:manage",
    "absences:view",
    "access:manage",
    "accounting:submit",
    "accounting:view",
    "audio:listen",
    "departments:manage",
    "departments:view",
    "discipleship:view",
    "events:view",
    "jobs:freelance",
    "jobs:post",
    "jobs:seek",
    "jobs:view",
    "members:manage",
    "members:view",
    "planning:department",
    "planning:edit",
    "planning:view",
    "rooms:reserve",
    "rooms:view",
  ],
  DEPARTMENT_HEAD: [
    "absences:manage",
    "absences:view",
    "accounting:submit",
    "accounting:view",
    "audio:listen",
    "departments:view",
    "discipleship:view",
    "events:view",
    "jobs:freelance",
    "jobs:post",
    "jobs:seek",
    "jobs:view",
    "members:manage",
    "members:view",
    "planning:department",
    "planning:edit",
    "planning:view",
    "rooms:reserve",
    "rooms:view",
  ],
  DISCIPLE_MAKER: [
    "audio:listen",
    "discipleship:manage",
    "discipleship:view",
    "jobs:freelance",
    "jobs:post",
    "jobs:seek",
    "jobs:view",
  ],
  REPORTER: [
    "audio:listen",
    "events:view",
    "jobs:freelance",
    "jobs:post",
    "jobs:seek",
    "jobs:view",
    "reports:edit",
    "reports:view",
  ],
  STAR: [
    "audio:listen",
    "jobs:freelance",
    "jobs:post",
    "jobs:seek",
    "jobs:view",
    "planning:view",
  ],
  AGENDA_QUALIFIER: [
    "agenda:qualify",
    "audio:listen",
    "jobs:freelance",
    "jobs:post",
    "jobs:seek",
    "jobs:view",
  ],
  ACCOUNTANT: [
    "accounting:manage",
    "accounting:stats",
    "accounting:view",
    "audio:listen",
    "jobs:freelance",
    "jobs:post",
    "jobs:seek",
    "jobs:view",
  ],
};

function buildFullRegistry() {
  const r = new ModuleRegistry();
  for (const mod of ALL_MODULES) r.register(mod);
  return r;
}

describe("buildRolePermissions", () => {
  it("couvre les 11 modules du registry", () => {
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

  it("produit exactement la matrice RBAC figée, pour les 10 rôles", () => {
    const matrix = buildRolePermissions(buildFullRegistry());

    for (const role of ALL_ROLES) {
      expect(matrix[role] ?? [], `Rôle ${role}`).toEqual(EXPECTED_MATRIX[role]);
    }
  });

  it("n'attribue aucun droit à un rôle hors de l'enum Prisma", () => {
    const matrix = buildRolePermissions(buildFullRegistry());
    expect(Object.keys(matrix).sort()).toEqual([...ALL_ROLES].sort());
    expect(matrix["UNKNOWN_ROLE"]).toBeUndefined();
  });

  it("les permissions sont triées par ordre alphabétique", () => {
    const matrix = buildRolePermissions(buildFullRegistry());
    for (const [role, perms] of Object.entries(matrix)) {
      expect(perms, `Rôle ${role}`).toEqual([...perms].sort());
    }
  });

  it("chaque permission déclarée par un manifeste est portée par au moins un rôle", () => {
    const registry = buildFullRegistry();
    const matrix = buildRolePermissions(registry);
    const granted = new Set(Object.values(matrix).flat());

    for (const perm of Object.keys(registry.collectPermissions())) {
      expect(granted.has(perm), `Permission orpheline : ${perm}`).toBe(true);
    }
  });
});

describe("roleHasPermission", () => {
  it("SUPER_ADMIN a toutes les permissions des 11 modules", () => {
    const registry = buildFullRegistry();
    for (const perm of Object.keys(registry.collectPermissions())) {
      expect(roleHasPermission(registry, "SUPER_ADMIN", perm), perm).toBe(true);
    }
  });

  it("tous les rôles ont audio:listen — la bibliothèque d'écoute est ouverte (spec 021)", () => {
    const registry = buildFullRegistry();
    for (const role of ALL_ROLES) {
      expect(roleHasPermission(registry, role, "audio:listen"), `Rôle ${role}`).toBe(true);
    }
  });

  it("tous les rôles ont les permissions transverses du module emploi, sauf jobs:manage", () => {
    const registry = buildFullRegistry();
    for (const role of ALL_ROLES) {
      for (const perm of ["jobs:view", "jobs:post", "jobs:seek", "jobs:freelance"]) {
        expect(roleHasPermission(registry, role, perm), `${role} / ${perm}`).toBe(true);
      }
    }
    for (const role of ["MINISTER", "DEPARTMENT_HEAD", "STAR", "ACCOUNTANT"] as Role[]) {
      expect(roleHasPermission(registry, role, "jobs:manage"), `Rôle ${role}`).toBe(false);
    }
  });

  it("STAR n'a ni planning:department ni les droits du module salles (spec 031)", () => {
    const registry = buildFullRegistry();
    expect(roleHasPermission(registry, "STAR", "planning:view")).toBe(true);
    expect(roleHasPermission(registry, "STAR", "planning:department")).toBe(false);
    expect(roleHasPermission(registry, "STAR", "rooms:view")).toBe(false);
    expect(roleHasPermission(registry, "STAR", "rooms:reserve")).toBe(false);
  });

  it("AGENDA_QUALIFIER qualifie sans voir ni planifier l'agenda", () => {
    const registry = buildFullRegistry();
    expect(roleHasPermission(registry, "AGENDA_QUALIFIER", "agenda:qualify")).toBe(true);
    expect(roleHasPermission(registry, "AGENDA_QUALIFIER", "agenda:view")).toBe(false);
    expect(roleHasPermission(registry, "AGENDA_QUALIFIER", "agenda:manage")).toBe(false);
  });

  it("ACCOUNTANT traite la compta sans accès au planning ni aux membres", () => {
    const registry = buildFullRegistry();
    expect(roleHasPermission(registry, "ACCOUNTANT", "accounting:manage")).toBe(true);
    expect(roleHasPermission(registry, "ACCOUNTANT", "accounting:view")).toBe(true);
    expect(roleHasPermission(registry, "ACCOUNTANT", "accounting:stats")).toBe(true);
    expect(roleHasPermission(registry, "ACCOUNTANT", "planning:view")).toBe(false);
    expect(roleHasPermission(registry, "ACCOUNTANT", "members:view")).toBe(false);
  });

  it("SECRETARY voit les stats compta sans pouvoir traiter les demandes", () => {
    const registry = buildFullRegistry();
    expect(roleHasPermission(registry, "SECRETARY", "accounting:stats")).toBe(true);
    expect(roleHasPermission(registry, "SECRETARY", "accounting:manage")).toBe(false);
    expect(roleHasPermission(registry, "SECRETARY", "planning:edit")).toBe(false);
    expect(roleHasPermission(registry, "SECRETARY", "members:manage")).toBe(false);
  });

  it("REPORTER est borné aux événements et comptes rendus", () => {
    const registry = buildFullRegistry();
    expect(roleHasPermission(registry, "REPORTER", "events:view")).toBe(true);
    expect(roleHasPermission(registry, "REPORTER", "reports:view")).toBe(true);
    expect(roleHasPermission(registry, "REPORTER", "reports:edit")).toBe(true);
    expect(roleHasPermission(registry, "REPORTER", "planning:view")).toBe(false);
  });

  it("DISCIPLE_MAKER n'a pas planning:edit", () => {
    expect(roleHasPermission(buildFullRegistry(), "DISCIPLE_MAKER", "planning:edit")).toBe(false);
  });

  it("church:manage et users:manage restent réservés au SUPER_ADMIN", () => {
    const registry = buildFullRegistry();
    for (const role of ALL_ROLES.filter((r) => r !== "SUPER_ADMIN")) {
      expect(roleHasPermission(registry, role, "church:manage"), `Rôle ${role}`).toBe(false);
      expect(roleHasPermission(registry, role, "users:manage"), `Rôle ${role}`).toBe(false);
    }
  });

  it("retourne false pour un rôle ou une permission inconnus", () => {
    const registry = buildFullRegistry();
    expect(roleHasPermission(registry, "UNKNOWN", "planning:view")).toBe(false);
    expect(roleHasPermission(registry, "ADMIN", "unknown:perm")).toBe(false);
  });
});

/**
 * Spec 038 (CA : « les permissions d'un module désactivé n'apparaissent dans les droits
 * d'aucun rôle ») — les tests ci-dessus utilisent tous `buildFullRegistry()` (les 11
 * modules) ; celui-ci construit un registry **partiel**, comme le ferait `boot()` avec
 * `ENABLED_MODULES` réduit, pour vérifier que `buildRolePermissions` n'expose bien que les
 * permissions des modules effectivement enregistrés.
 */
describe("buildRolePermissions — registry partiel (spec 038)", () => {
  it("un module absent du registry ne contribue aucune permission à la matrice", () => {
    const registry = new ModuleRegistry();
    registry.register(coreModule);
    registry.register(planningModule);
    // accounting, jobs, audio… ne sont pas enregistrés.

    const rolePermissions = buildRolePermissions(registry);

    for (const perms of Object.values(rolePermissions)) {
      expect(perms).not.toContain("accounting:manage");
      expect(perms).not.toContain("jobs:view");
      expect(perms).not.toContain("audio:listen");
    }
    // Les permissions des modules actifs restent présentes.
    expect(rolePermissions.ADMIN).toContain("planning:edit");
    expect(rolePermissions.SUPER_ADMIN).toContain("church:manage");
  });

  it("le seul module racine actif ne laisse que ses propres permissions", () => {
    const registry = new ModuleRegistry();
    registry.register(coreModule);

    const rolePermissions = buildRolePermissions(registry);

    expect(rolePermissions.SUPER_ADMIN.sort()).toEqual(
      ["access:manage", "church:manage", "users:manage"].sort()
    );
    expect(rolePermissions.ACCOUNTANT ?? []).toHaveLength(0);
  });
});
