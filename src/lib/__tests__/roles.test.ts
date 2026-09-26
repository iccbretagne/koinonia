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
    expect(ALL_ROLES.length).toBe(SCHEMA_ROLES.length);
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
