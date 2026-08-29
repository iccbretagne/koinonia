/**
 * /dashboard/stats n'avait aucune garde de permission et listait TOUS les départements de
 * l'église dans le sélecteur, quel que soit le périmètre de l'appelant — un STAR (pas de
 * planning:department) pouvait ouvrir la page par URL directe, et un responsable de
 * département voyait les noms de tous les départements de l'église, pas seulement les siens.
 * L'API /api/departments/[id]/stats appliquait déjà planning:department + requireDepartmentAccess
 * (spec 031), mais la page elle-même ne filtrait rien avant d'y arriver.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("REDIRECT"); }) }));

const churchId = "church-1";

function mockAuth(opts: {
  requireChurchPermission: () => Promise<unknown> | unknown;
  scope: { scoped: false } | { scoped: true; departmentIds: string[] };
}) {
  vi.doMock("@/lib/auth", () => ({
    auth: vi.fn().mockResolvedValue({ user: { id: "u1" } }),
    getCurrentChurchId: vi.fn().mockResolvedValue(churchId),
    requireChurchPermission: vi.fn().mockImplementation(opts.requireChurchPermission),
    getUserDepartmentScope: vi.fn().mockReturnValue(opts.scope),
  }));
}

describe("/dashboard/stats — périmètre d'accès", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    prismaMock.department.findMany.mockResolvedValue([]);
  });

  it("refuse un utilisateur sans planning:department (ex. STAR)", async () => {
    mockAuth({
      requireChurchPermission: () => {
        throw new Error("FORBIDDEN");
      },
      scope: { scoped: true, departmentIds: [] },
    });
    const StatsPage = (await import("../page")).default;

    await expect(
      StatsPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow("FORBIDDEN");
  });

  it("limite le sélecteur de départements au périmètre d'un responsable de département", async () => {
    mockAuth({
      requireChurchPermission: () => Promise.resolve(undefined),
      scope: { scoped: true, departmentIds: ["dept-A"] },
    });
    const StatsPage = (await import("../page")).default;

    await StatsPage({ searchParams: Promise.resolve({}) });

    expect(prismaMock.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["dept-A"] } }),
      })
    );
  });

  it("ne filtre pas par id pour un utilisateur au périmètre non restreint (Admin)", async () => {
    mockAuth({
      requireChurchPermission: () => Promise.resolve(undefined),
      scope: { scoped: false },
    });
    const StatsPage = (await import("../page")).default;

    await StatsPage({ searchParams: Promise.resolve({}) });

    const call = prismaMock.department.findMany.mock.calls[0][0];
    expect(call.where).not.toHaveProperty("id");
  });
});
