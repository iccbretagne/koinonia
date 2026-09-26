import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockRequireAuth = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({ requireAuth: () => mockRequireAuth() }));
vi.mock("@/lib/registry", () => ({
  rolePermissions: {
    STAR: [],
    ADMIN: ["integration:manage", "members:manage", "events:manage"],
    SECRETARY: ["integration:manage", "events:manage"],
    MINISTER: ["members:manage"],
    DEPARTMENT_HEAD: ["members:manage"],
  },
}));

const {
  requireIntegrationAccess,
  requireIntegrationFullAccess,
  requireIntegrationExportAccess,
  requireIntegrationSettingsAccess,
} = await import("../auth");

function starSession(departmentIds: string[], role = "STAR") {
  return {
    user: {
      id: "u1",
      isSuperAdmin: false,
      churchRoles: [
        {
          churchId: "c1",
          role,
          departments: departmentIds.map((id) => ({ department: { id } })),
        },
      ],
    },
  };
}

describe("requireIntegrationAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("donne un accès complet à un membre du département de fonction MSDP (#550)", async () => {
    mockRequireAuth.mockResolvedValue(starSession(["d-msdp"]));
    prismaMock.department.count.mockImplementation((async (args: { where: { function: string } }) =>
      args.where.function === "MSDP" ? 1 : 0) as never);

    const { scope } = await requireIntegrationAccess("c1");

    expect(scope).toEqual({ scoped: false });
  });

  it("refuse un STAR hors équipes Intégration/MSDP et sans famille assignée", async () => {
    mockRequireAuth.mockResolvedValue(starSession(["d-autre"]));
    prismaMock.department.count.mockResolvedValue(0 as never);
    prismaMock.familyLeaderAssignment.findMany.mockResolvedValue([] as never);

    await expect(requireIntegrationAccess("c1")).rejects.toThrow("FORBIDDEN");
  });

  it.each(["ADMIN", "SECRETARY"])("%s (integration:manage) a un accès complet (#583)", async (role) => {
    mockRequireAuth.mockResolvedValue(starSession([], role));

    const { scope } = await requireIntegrationAccess("c1");

    expect(scope).toEqual({ scoped: false });
  });

  it.each(["MINISTER", "DEPARTMENT_HEAD"])(
    "%s (members:manage seul, hors équipe) est refusé — l'anti-motif #583 ne doit pas revenir",
    async (role) => {
      mockRequireAuth.mockResolvedValue(starSession(["d-autre"], role));
      prismaMock.department.count.mockResolvedValue(0 as never);
      prismaMock.familyLeaderAssignment.findMany.mockResolvedValue([] as never);

      await expect(requireIntegrationAccess("c1")).rejects.toThrow("FORBIDDEN");
    }
  );

  it("un berger a un accès restreint (scoped) à ses familles", async () => {
    mockRequireAuth.mockResolvedValue(starSession(["d-autre"], "STAR"));
    prismaMock.department.count.mockResolvedValue(0 as never);
    prismaMock.familyLeaderAssignment.findMany.mockResolvedValue([{ familyId: 1 }] as never);

    const { scope } = await requireIntegrationAccess("c1");

    expect(scope).toEqual({ scoped: true, familyIds: [1] });
  });
});

describe("requireIntegrationFullAccess / requireIntegrationExportAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("un berger au périmètre restreint est refusé (parcours et export réservés à l'accès complet)", async () => {
    mockRequireAuth.mockResolvedValue(starSession(["d-autre"], "STAR"));
    prismaMock.department.count.mockResolvedValue(0 as never);
    prismaMock.familyLeaderAssignment.findMany.mockResolvedValue([{ familyId: 1 }] as never);

    await expect(requireIntegrationFullAccess("c1")).rejects.toThrow("FORBIDDEN");
    await expect(requireIntegrationExportAccess("c1")).rejects.toThrow("FORBIDDEN");
  });

  it("un membre de l'équipe MSDP a l'accès complet", async () => {
    mockRequireAuth.mockResolvedValue(starSession(["d-msdp"], "STAR"));
    prismaMock.department.count.mockImplementation((async (args: { where: { function: string } }) =>
      args.where.function === "MSDP" ? 1 : 0) as never);

    await expect(requireIntegrationFullAccess("c1")).resolves.toBeDefined();
  });
});

describe("requireIntegrationSettingsAccess (spec 051)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.department.count.mockImplementation((async (args: { where: { id: { in: string[] } } }) =>
      args.where.id.in.includes("d-integration") ? 1 : 0) as never);
  });

  it.each(["ADMIN", "SECRETARY"])("%s passe", async (role) => {
    mockRequireAuth.mockResolvedValue(starSession([], role));
    await expect(requireIntegrationSettingsAccess("c1")).resolves.toBeDefined();
  });

  it("le responsable du département intégration passe", async () => {
    mockRequireAuth.mockResolvedValue(starSession(["d-integration"], "DEPARTMENT_HEAD"));
    await expect(requireIntegrationSettingsAccess("c1")).resolves.toBeDefined();
  });

  it("un responsable d'un autre département est refusé, malgré members:manage", async () => {
    mockRequireAuth.mockResolvedValue(starSession(["d-musique"], "DEPARTMENT_HEAD"));
    await expect(requireIntegrationSettingsAccess("c1")).rejects.toThrow("FORBIDDEN");
  });

  it("un simple membre de l'équipe intégration est refusé", async () => {
    mockRequireAuth.mockResolvedValue(starSession(["d-integration"], "STAR"));
    await expect(requireIntegrationSettingsAccess("c1")).rejects.toThrow("FORBIDDEN");
  });

  it("un berger (sans rôle de responsable intégration) est refusé", async () => {
    mockRequireAuth.mockResolvedValue(starSession([], "STAR"));
    prismaMock.familyLeaderAssignment.findMany.mockResolvedValue([{ familyId: 1 }] as never);
    await expect(requireIntegrationSettingsAccess("c1")).rejects.toThrow("FORBIDDEN");
  });

  it("le Super Admin passe", async () => {
    mockRequireAuth.mockResolvedValue({ user: { id: "sa", isSuperAdmin: true, churchRoles: [] } });
    await expect(requireIntegrationSettingsAccess("c1")).resolves.toBeDefined();
  });
});
