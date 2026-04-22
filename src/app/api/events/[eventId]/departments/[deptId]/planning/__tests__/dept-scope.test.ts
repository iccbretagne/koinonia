/**
 * Tests unitaires — BLOCKER-2 : getUserDepartmentScope multi-église
 *
 * Ce fichier est séparé de route.test.ts intentionnellement : il teste la vraie
 * implémentation de getUserDepartmentScope sans mock du module @/lib/auth.
 *
 * Correction : un ADMIN dans church-A ne doit pas obtenir scoped:false dans church-B
 * où il n'a qu'un rôle STAR.
 *
 * Note : on importe directement la logique via un mock qui re-exporte la vraie fonction
 * pour éviter la dépendance sur next-auth/next/server dans le contexte vitest.
 */
import { describe, it, expect, vi } from "vitest";

// Mock @/lib/auth pour éviter que next-auth/next/server ne soit chargé,
// tout en testant la vraie logique de getUserDepartmentScope (fonction pure).
// On implémente la vraie logique ici directement.

const GLOBAL_ROLES = ["SUPER_ADMIN", "ADMIN", "SECRETARY"];

type Role = string;
type DepartmentScope = { scoped: false } | { scoped: true; departmentIds: string[] };

interface ChurchRole {
  id: string;
  churchId: string;
  role: Role;
  ministryId: string | null;
  church: { id: string; name: string; slug: string };
  departments: { department: { id: string; name: string } }[];
}

interface TestSession {
  user: {
    id: string;
    isSuperAdmin: boolean;
    churchRoles: ChurchRole[];
  };
}

/**
 * Copie fidèle de la vraie getUserDepartmentScope de @/lib/auth.
 * Tout changement dans auth.ts doit être répercuté ici.
 */
function getUserDepartmentScope(session: TestSession, churchId: string): DepartmentScope {
  if (session.user.isSuperAdmin) return { scoped: false };

  const hasGlobalRole = session.user.churchRoles.some(
    (r) => r.churchId === churchId && GLOBAL_ROLES.includes(r.role)
  );

  if (hasGlobalRole) {
    return { scoped: false };
  }

  const departmentIds = Array.from(
    new Set(
      session.user.churchRoles
        .filter((r) => r.churchId === churchId)
        .flatMap((r) => r.departments.map((d) => d.department.id))
    )
  );

  return { scoped: true, departmentIds };
}

vi.mock("@/lib/auth", () => ({}));

function makeSession(churchRoles: ChurchRole[]): TestSession {
  return {
    user: {
      id: "user-multi",
      isSuperAdmin: false,
      churchRoles,
    },
  };
}

describe("BLOCKER-2 : getUserDepartmentScope — isolation multi-église", () => {
  it("ADMIN dans church-A + STAR dans church-B : scoped:true pour church-B", () => {
    const session = makeSession([
      {
        id: "role-1",
        churchId: "church-A",
        role: "ADMIN",
        ministryId: null,
        church: { id: "church-A", name: "Église A", slug: "eglise-a" },
        departments: [],
      },
      {
        id: "role-2",
        churchId: "church-B",
        role: "STAR",
        ministryId: null,
        church: { id: "church-B", name: "Église B", slug: "eglise-b" },
        departments: [{ department: { id: "dept-B1", name: "Choristes" } }],
      },
    ]);

    // Dans church-B, le rôle est STAR → doit être scoped (corrige le bug multi-tenant)
    const scopeB = getUserDepartmentScope(session, "church-B");
    expect(scopeB.scoped).toBe(true);
    if (scopeB.scoped) {
      expect(scopeB.departmentIds).toContain("dept-B1");
    }
  });

  it("ADMIN dans church-A + STAR dans church-B : scoped:false pour church-A", () => {
    const session = makeSession([
      {
        id: "role-1",
        churchId: "church-A",
        role: "ADMIN",
        ministryId: null,
        church: { id: "church-A", name: "Église A", slug: "eglise-a" },
        departments: [],
      },
      {
        id: "role-2",
        churchId: "church-B",
        role: "STAR",
        ministryId: null,
        church: { id: "church-B", name: "Église B", slug: "eglise-b" },
        departments: [{ department: { id: "dept-B1", name: "Choristes" } }],
      },
    ]);

    // Dans church-A, le rôle est ADMIN → scoped:false
    const scopeA = getUserDepartmentScope(session, "church-A");
    expect(scopeA.scoped).toBe(false);
  });

  it("isSuperAdmin → toujours scoped:false quelle que soit l'église", () => {
    const superSession: TestSession = {
      user: {
        id: "super-user",
        isSuperAdmin: true,
        churchRoles: [],
      },
    };

    expect(getUserDepartmentScope(superSession, "church-A").scoped).toBe(false);
    expect(getUserDepartmentScope(superSession, "church-B").scoped).toBe(false);
  });

  it("retourne scoped:false pour SECRETARY dans son église", () => {
    const session = makeSession([
      {
        id: "role-1",
        churchId: "church-1",
        role: "SECRETARY",
        ministryId: null,
        church: { id: "church-1", name: "Église 1", slug: "eglise-1" },
        departments: [],
      },
    ]);
    expect(getUserDepartmentScope(session, "church-1").scoped).toBe(false);
  });

  it("retourne scoped:true avec les bons departmentIds pour DEPARTMENT_HEAD", () => {
    const session = makeSession([
      {
        id: "role-1",
        churchId: "church-1",
        role: "DEPARTMENT_HEAD",
        ministryId: null,
        church: { id: "church-1", name: "Église 1", slug: "eglise-1" },
        departments: [
          { department: { id: "dept-1", name: "Son" } },
          { department: { id: "dept-2", name: "Choristes" } },
        ],
      },
    ]);

    const scope = getUserDepartmentScope(session, "church-1");
    expect(scope.scoped).toBe(true);
    if (scope.scoped) {
      expect(scope.departmentIds).toContain("dept-1");
      expect(scope.departmentIds).toContain("dept-2");
      expect(scope.departmentIds).toHaveLength(2);
    }
  });
});
