import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { getFunctionDepartmentIds, isMemberOfFunction, getFunctionDepartmentsMap } = await import(
  "../function-departments"
);

describe("getFunctionDepartmentIds (spec 046)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retourne un tableau vide quand aucun département ne porte la fonction", async () => {
    prismaMock.department.findMany.mockResolvedValue([]);
    const ids = await getFunctionDepartmentIds("church-1", "MSDP");
    expect(ids).toEqual([]);
  });

  it("retourne un seul id quand un seul département porte la fonction", async () => {
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-1" }] as never);
    const ids = await getFunctionDepartmentIds("church-1", "MSDP");
    expect(ids).toEqual(["dept-1"]);
  });

  it("retourne plusieurs ids, filtrés par église, triés de façon déterministe", async () => {
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-1" }, { id: "dept-2" }] as never);
    const ids = await getFunctionDepartmentIds("church-1", "MSDP");

    expect(prismaMock.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { function: "MSDP", ministry: { churchId: "church-1" } },
        orderBy: { id: "asc" },
      })
    );
    expect(ids).toEqual(["dept-1", "dept-2"]);
  });
});

describe("isMemberOfFunction (spec 046)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retourne false sans requête quand l'utilisateur n'a aucun département", async () => {
    const result = await isMemberOfFunction([], "church-1", "MSDP");
    expect(result).toBe(false);
    expect(prismaMock.department.findMany).not.toHaveBeenCalled();
  });

  it("retourne true si l'utilisateur appartient à l'un des départements de la fonction", async () => {
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-1" }, { id: "dept-2" }] as never);
    const result = await isMemberOfFunction(["dept-2"], "church-1", "MSDP");
    expect(result).toBe(true);
  });

  it("retourne false si l'utilisateur n'appartient à aucun département de la fonction", async () => {
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-1" }] as never);
    const result = await isMemberOfFunction(["dept-other"], "church-1", "MSDP");
    expect(result).toBe(false);
  });
});

describe("getFunctionDepartmentsMap (spec 046)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("effectue une seule requête pour plusieurs fonctions", async () => {
    prismaMock.department.findMany.mockResolvedValue([
      { id: "dept-1", name: "Secrétariat général", function: "SECRETARIAT" },
      { id: "dept-2", name: "Média A", function: "PRODUCTION_MEDIA" },
      { id: "dept-3", name: "Média B", function: "PRODUCTION_MEDIA" },
    ] as never);

    const map = await getFunctionDepartmentsMap("church-1", ["SECRETARIAT", "PRODUCTION_MEDIA"]);

    expect(prismaMock.department.findMany).toHaveBeenCalledTimes(1);
    expect(map.get("SECRETARIAT")).toEqual([{ id: "dept-1", name: "Secrétariat général" }]);
    expect(map.get("PRODUCTION_MEDIA")).toEqual([
      { id: "dept-2", name: "Média A" },
      { id: "dept-3", name: "Média B" },
    ]);
  });

  it("retourne un tableau vide pour une fonction sans département configuré", async () => {
    prismaMock.department.findMany.mockResolvedValue([]);
    const map = await getFunctionDepartmentsMap("church-1", ["MSDP"]);
    expect(map.get("MSDP")).toEqual([]);
  });
});
