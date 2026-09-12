import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockRequireAuth = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({ requireAuth: () => mockRequireAuth() }));
vi.mock("@/lib/registry", () => ({ rolePermissions: { STAR: [] } }));

const { requireIntegrationAccess } = await import("../auth");

function starSession(departmentIds: string[]) {
  return {
    user: {
      id: "u1",
      isSuperAdmin: false,
      churchRoles: [
        {
          churchId: "c1",
          role: "STAR",
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
});
