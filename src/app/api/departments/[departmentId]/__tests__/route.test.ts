import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockRequireChurchPermission = vi.fn();
const mockResolveChurchId = vi.fn().mockResolvedValue("church-1");
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  resolveChurchId: (...args: unknown[]) => mockResolveChurchId(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { PATCH } = await import("../route");
const makeParams = (departmentId: string) => Promise.resolve({ departmentId });

function makeRequest(body: unknown) {
  return new Request("http://localhost", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/departments/[departmentId] — assignation de fonction (spec 046)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveChurchId.mockResolvedValue("church-1");
    mockRequireChurchPermission.mockResolvedValue({
      user: { id: "admin-1", isSuperAdmin: false },
    });
    prismaMock.department.findUnique.mockResolvedValue({
      id: "dept-B",
      isSystem: false,
      ministry: { churchId: "church-1" },
    } as never);
    prismaMock.department.update.mockResolvedValue({
      id: "dept-B",
      name: "Intégration Jeunes",
      function: "INTEGRATION",
    } as never);
  });

  it("assigne une fonction à un second département sans désassigner le premier", async () => {
    const res = await PATCH(makeRequest({ function: "INTEGRATION" }), { params: makeParams("dept-B") });

    expect(res.status).toBe(200);
    expect(prismaMock.department.update).toHaveBeenCalledWith({
      where: { id: "dept-B" },
      data: { function: "INTEGRATION" },
      select: { id: true, name: true, function: true },
    });
    // Aucune écriture sur un autre département — le premier reste porteur de la fonction.
    expect(prismaMock.department.updateMany).not.toHaveBeenCalled();
  });

  it("retirer la fonction d'un département n'affecte aucun autre département", async () => {
    prismaMock.department.update.mockResolvedValue({
      id: "dept-B",
      name: "Intégration Jeunes",
      function: null,
    } as never);

    const res = await PATCH(makeRequest({ function: null }), { params: makeParams("dept-B") });

    expect(res.status).toBe(200);
    expect(prismaMock.department.updateMany).not.toHaveBeenCalled();
  });
});
