// Spec 054 (Lot 1, T51) — `src/lib/roles.ts` est la source unique des libellés/descriptions de
// rôle. Ce test garantit qu'aucun `Role` de l'enum Prisma n'est oublié dans une des tables, et
// que les listes dérivées (`ASSIGNABLE_BY_MINISTER`, `PRIVILEGED_ROLES`, `ALL_ROLES`) restent
// cohérentes entre elles.
import { describe, it, expect } from "vitest";
import {
  ALL_ROLES,
  ROLE_LABELS,
  ROLE_SHORT_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_CATEGORY,
  ROLE_CATEGORY_LABELS,
  ASSIGNABLE_BY_MINISTER,
  PRIVILEGED_ROLES,
  canGrantRole,
  primaryRole,
  PRIMARY_ROLE_ORDER,
} from "@/lib/roles";
import type { Role } from "@/generated/prisma/client";

// Recopiée de prisma/schema.prisma (enum Role) — seule façon de détecter un rôle ajouté au
// schéma mais oublié dans roles.ts sans dépendre du client Prisma généré à l'exécution.
const SCHEMA_ROLES: Role[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "SECRETARY",
  "MINISTER",
  "DEPARTMENT_HEAD",
  "DISCIPLE_MAKER",
  "REPORTER",
  "STAR",
  "PASTORAL_CARE_REFERENT",
  "ACCOUNTANT",
];

describe("src/lib/roles.ts — source unique (spec 054)", () => {
  it("ALL_ROLES contient exactement les rôles de l'enum Prisma, sans doublon", () => {
    expect(new Set(ALL_ROLES)).toEqual(new Set(SCHEMA_ROLES));
    expect(ALL_ROLES).toHaveLength(SCHEMA_ROLES.length);
  });

  it.each(SCHEMA_ROLES)("%s a un libellé, un libellé court, une description et une catégorie", (role) => {
    expect(ROLE_LABELS[role]).toBeTruthy();
    expect(ROLE_SHORT_LABELS[role]).toBeTruthy();
    expect(ROLE_DESCRIPTIONS[role]).toBeTruthy();
    expect(ROLE_CATEGORY_LABELS[ROLE_CATEGORY[role]]).toBeTruthy();
  });

  it("ASSIGNABLE_BY_MINISTER ne contient aucun rôle privilégié (transverse)", () => {
    for (const role of ASSIGNABLE_BY_MINISTER) {
      expect(PRIVILEGED_ROLES).not.toContain(role);
    }
  });

  it("PRIVILEGED_ROLES et ASSIGNABLE_BY_MINISTER sont des sous-ensembles disjoints d'ALL_ROLES", () => {
    for (const role of [...PRIVILEGED_ROLES, ...ASSIGNABLE_BY_MINISTER]) {
      expect(ALL_ROLES).toContain(role);
    }
    const intersection = ASSIGNABLE_BY_MINISTER.filter((r) => PRIVILEGED_ROLES.includes(r));
    expect(intersection).toEqual([]);
  });
});

describe("canGrantRole", () => {
  const superAdmin = { isSuperAdmin: true, canGrantChurchAdmins: true };
  const admin = { isSuperAdmin: false, canGrantChurchAdmins: true };
  const secretary = { isSuperAdmin: false, canGrantChurchAdmins: false };

  it("Super Admin : seul un Super Admin l'attribue", () => {
    expect(canGrantRole("SUPER_ADMIN", superAdmin)).toBe(true);
    expect(canGrantRole("SUPER_ADMIN", admin)).toBe(false);
  });

  it("Admin et Secrétaire : un Admin de l'église (access:admins), pas un Secrétaire", () => {
    for (const role of ["ADMIN", "SECRETARY"] as Role[]) {
      expect(canGrantRole(role, admin), role).toBe(true);
      expect(canGrantRole(role, secretary), role).toBe(false);
    }
  });

  it("les autres rôles : access:manage suffit", () => {
    for (const role of ALL_ROLES.filter((r) => !PRIVILEGED_ROLES.includes(r))) {
      expect(canGrantRole(role, secretary), role).toBe(true);
    }
  });
});

describe("primaryRole (spec 092) — rôle principal déterministe", () => {
  const C = "church-1";
  const rows = (...roles: Role[]) => roles.map((role) => ({ churchId: C, role }));
  const rank = (r: Role) => PRIMARY_ROLE_ORDER.indexOf(r);

  it("couvre tous les rôles du schéma", () => {
    expect(new Set(PRIMARY_ROLE_ORDER)).toEqual(new Set(SCHEMA_ROLES));
  });

  it("ordre fixé par la spec", () => {
    expect(PRIMARY_ROLE_ORDER).toEqual([
      "SUPER_ADMIN", "ADMIN", "SECRETARY", "ACCOUNTANT", "PASTORAL_CARE_REFERENT",
      "MINISTER", "DEPARTMENT_HEAD", "REPORTER", "DISCIPLE_MAKER", "STAR",
    ]);
  });

  const pairs = SCHEMA_ROLES.flatMap((a) => SCHEMA_ROLES.filter((b) => b !== a).map((b) => [a, b] as const));
  it.each(pairs)("%s + %s : même résultat dans les deux ordres, le mieux classé", (a, b) => {
    const expected = rank(a) < rank(b) ? a : b;
    expect(primaryRole(rows(a, b), C, false)).toBe(expected);
    expect(primaryRole(rows(b, a), C, false)).toBe(expected);
  });

  it("Comptable + STAR : Comptable, quel que soit l'ordre", () => {
    expect(primaryRole(rows("STAR", "ACCOUNTANT"), C, false)).toBe("ACCOUNTANT");
    expect(primaryRole(rows("ACCOUNTANT", "STAR"), C, false)).toBe("ACCOUNTANT");
  });

  it("Super Admin (drapeau) passe devant tout, même sans rôle d'église", () => {
    expect(primaryRole([], C, true)).toBe("SUPER_ADMIN");
    expect(primaryRole(rows("STAR"), C, true)).toBe("SUPER_ADMIN");
  });

  it("le rôle Secrétaire virtuel compte comme un rôle réel", () => {
    const virtual = { id: `virtual-secretariat-${C}`, churchId: C, role: "SECRETARY" as Role };
    expect(primaryRole([{ churchId: C, role: "DEPARTMENT_HEAD" }, virtual], C, false)).toBe("SECRETARY");
  });

  it("sans rôle dans l'église courante ⇒ STAR (les rôles d'une autre église sont ignorés)", () => {
    expect(primaryRole([], C, false)).toBe("STAR");
    expect(primaryRole([{ churchId: "other", role: "ADMIN" }], C, false)).toBe("STAR");
    expect(primaryRole(rows("ADMIN"), null, false)).toBe("STAR");
  });
});

