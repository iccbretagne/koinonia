import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import {
  createAdminSession,
  createSecretarySession,
  createSuperAdminSession,
  createMinisterSession,
  createDepartmentHeadSession,
  createStarSession,
  createSession,
} from "@/__mocks__/auth";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({
  default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));

const { getUserDepartmentScope, requireDepartmentAccess, getUserMinistryScope } =
  await import("../auth");

describe("getUserDepartmentScope", () => {
  it("SUPER_ADMIN : non scoped", () => {
    expect(getUserDepartmentScope(createSuperAdminSession(), "church-1")).toEqual({
      scoped: false,
    });
  });

  it("ADMIN et SECRETARY : non scoped (rôle global)", () => {
    expect(getUserDepartmentScope(createAdminSession(), "church-1")).toEqual({
      scoped: false,
    });
    expect(getUserDepartmentScope(createSecretarySession(), "church-1")).toEqual({
      scoped: false,
    });
  });

  it("DEPARTMENT_HEAD : scoped sur ses départements assignés", () => {
    const session = createDepartmentHeadSession([{ id: "dept-A", name: "A" }]);
    expect(getUserDepartmentScope(session, "church-1")).toEqual({
      scoped: true,
      departmentIds: ["dept-A"],
    });
  });

  it("STAR : scoped et VIDE (aucun user_departments) — restriction totale", () => {
    const session = createStarSession();
    expect(getUserDepartmentScope(session, "church-1")).toEqual({
      scoped: true,
      departmentIds: [],
    });
  });

  it("multi-église : un rôle global dans A ne donne rien dans B", () => {
    const session = createSession({
      churchRoles: [
        {
          id: "role-A",
          churchId: "church-A",
          role: "ADMIN",
          ministryId: null,
          church: { id: "church-A", name: "A", slug: "a" },
          departments: [],
        },
        {
          id: "role-B",
          churchId: "church-B",
          role: "STAR",
          ministryId: null,
          church: { id: "church-B", name: "B", slug: "b" },
          departments: [],
        },
      ],
    });
    expect(getUserDepartmentScope(session, "church-B")).toEqual({
      scoped: true,
      departmentIds: [],
    });
  });

  it("adjoint (isDeputy) : inclus dans le périmètre au même titre que le principal", () => {
    const session = createSession({
      churchRoles: [
        {
          id: "role-1",
          churchId: "church-1",
          role: "DEPARTMENT_HEAD",
          ministryId: null,
          church: { id: "church-1", name: "Test", slug: "test" },
          departments: [
            { department: { id: "dept-A", name: "A" }, isDeputy: true } as never,
          ],
        },
      ],
    });
    expect(getUserDepartmentScope(session, "church-1")).toEqual({
      scoped: true,
      departmentIds: ["dept-A"],
    });
  });

  it("cumul de rôles dans la même église : union des départements", () => {
    const session = createSession({
      churchRoles: [
        {
          id: "role-1",
          churchId: "church-1",
          role: "DEPARTMENT_HEAD",
          ministryId: null,
          church: { id: "church-1", name: "Test", slug: "test" },
          departments: [{ department: { id: "dept-A", name: "A" } }],
        },
        {
          id: "role-2",
          churchId: "church-1",
          role: "DEPARTMENT_HEAD",
          ministryId: null,
          church: { id: "church-1", name: "Test", slug: "test" },
          departments: [{ department: { id: "dept-B", name: "B" } }],
        },
      ],
    });
    const scope = getUserDepartmentScope(session, "church-1");
    expect(scope).toEqual({ scoped: true, departmentIds: expect.arrayContaining(["dept-A", "dept-B"]) });
    if (scope.scoped) expect(scope.departmentIds).toHaveLength(2);
  });
});

describe("requireDepartmentAccess", () => {
  it("périmètre non restreint : n'importe quel département passe", () => {
    expect(() =>
      requireDepartmentAccess(createAdminSession(), "church-1", "dept-anything")
    ).not.toThrow();
  });

  it("périmètre restreint et contenant le département : passe", () => {
    const session = createDepartmentHeadSession([{ id: "dept-A", name: "A" }]);
    expect(() => requireDepartmentAccess(session, "church-1", "dept-A")).not.toThrow();
  });

  it("périmètre restreint et ne contenant pas le département : refuse", () => {
    const session = createDepartmentHeadSession([{ id: "dept-A", name: "A" }]);
    expect(() => requireDepartmentAccess(session, "church-1", "dept-B")).toThrow("FORBIDDEN");
  });

  it("périmètre restreint et VIDE (STAR) : refuse tout, y compris son propre département", () => {
    const session = createStarSession();
    expect(() => requireDepartmentAccess(session, "church-1", "dept-A")).toThrow("FORBIDDEN");
  });
});

describe("getUserMinistryScope", () => {
  it("SUPER_ADMIN, ADMIN, SECRETARY : non scoped", () => {
    expect(getUserMinistryScope(createSuperAdminSession(), "church-1")).toEqual({
      scoped: false,
    });
    expect(getUserMinistryScope(createAdminSession(), "church-1")).toEqual({
      scoped: false,
    });
    expect(getUserMinistryScope(createSecretarySession(), "church-1")).toEqual({
      scoped: false,
    });
  });

  it("MINISTER : scoped sur son ministère assigné", () => {
    const session = createMinisterSession("ministry-A");
    expect(getUserMinistryScope(session, "church-1")).toEqual({
      scoped: true,
      ministryIds: ["ministry-A"],
    });
  });

  it("MINISTER sans ministère assigné : scoped et VIDE — ne gère personne", () => {
    const session = createSession({
      churchRoles: [
        {
          id: "role-1",
          churchId: "church-1",
          role: "MINISTER",
          ministryId: null,
          church: { id: "church-1", name: "Test", slug: "test" },
          departments: [],
        },
      ],
    });
    expect(getUserMinistryScope(session, "church-1")).toEqual({
      scoped: true,
      ministryIds: [],
    });
  });

  it("DEPARTMENT_HEAD et STAR : scoped et vide (aucun ministryId sur leur rôle)", () => {
    expect(
      getUserMinistryScope(createDepartmentHeadSession([{ id: "dept-A", name: "A" }]), "church-1")
    ).toEqual({ scoped: true, ministryIds: [] });
    expect(getUserMinistryScope(createStarSession(), "church-1")).toEqual({
      scoped: true,
      ministryIds: [],
    });
  });

  it("multi-église : un ministère dans A ne donne rien dans B", () => {
    const session = createSession({
      churchRoles: [
        {
          id: "role-A",
          churchId: "church-A",
          role: "MINISTER",
          ministryId: "ministry-A",
          church: { id: "church-A", name: "A", slug: "a" },
          departments: [],
        },
      ],
    });
    expect(getUserMinistryScope(session, "church-B")).toEqual({
      scoped: true,
      ministryIds: [],
    });
  });
});
