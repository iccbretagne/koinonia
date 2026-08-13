import { describe, it, expect } from "vitest";
import { DEV_USERS } from "../dev-users";

// Rôles métier de Koinonia (voir CLAUDE.md, section « Roles et permissions »).
const CORE_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "SECRETARY",
  "MINISTER",
  "DEPARTMENT_HEAD",
  "DISCIPLE_MAKER",
  "REPORTER",
  "STAR",
];

describe("DEV_USERS — comptes de test de l'environnement de développement", () => {
  it("fournit au moins un compte pour chaque rôle métier de Koinonia", () => {
    for (const role of CORE_ROLES) {
      expect(DEV_USERS.some((u) => u.role === role)).toBe(true);
    }
  });

  it("fournit au moins deux comptes DEPARTMENT_HEAD sur des départements distincts", () => {
    const heads = DEV_USERS.filter((u) => u.role === "DEPARTMENT_HEAD");
    expect(heads.length).toBeGreaterThanOrEqual(2);

    const departmentKeys = heads.flatMap((u) => u.departmentKeys ?? []);
    expect(new Set(departmentKeys).size).toBeGreaterThanOrEqual(2);
  });

  it("a des emails et des clés uniques", () => {
    const emails = DEV_USERS.map((u) => u.email);
    const keys = DEV_USERS.map((u) => u.key);
    expect(new Set(emails).size).toBe(DEV_USERS.length);
    expect(new Set(keys).size).toBe(DEV_USERS.length);
  });

  it("n'utilise que des emails du domaine dev.local (jamais un domaine réel)", () => {
    for (const u of DEV_USERS) {
      expect(u.email.endsWith("@dev.local")).toBe(true);
    }
  });
});
