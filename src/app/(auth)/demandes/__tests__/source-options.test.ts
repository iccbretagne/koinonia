import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { buildSourceOptions } = await import("../source-options");

const dept = (id: string, name: string) => ({ department: { id, name } });

describe("buildSourceOptions", () => {
  it("liste ministères puis départements dans l'ordre des rôles, sans doublon, en une requête", async () => {
    prismaMock.ministry.findMany.mockResolvedValue([
      { id: "min-1", name: "Louange" },
      { id: "min-2", name: "Accueil" },
    ] as never);

    const options = await buildSourceOptions([
      { ministryId: "min-1", departments: [dept("d-1", "Choristes")] },
      { ministryId: null, departments: [dept("d-1", "Choristes"), dept("d-2", "Son")] },
      { ministryId: "min-2", departments: [] },
      { ministryId: "min-1", departments: [] },
    ]);

    expect(options).toEqual([
      { type: "ministry", id: "min-1", label: "Louange" },
      { type: "department", id: "d-1", label: "Choristes" },
      { type: "department", id: "d-2", label: "Son" },
      { type: "ministry", id: "min-2", label: "Accueil" },
    ]);
    expect(prismaMock.ministry.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.ministry.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["min-1", "min-2", "min-1"] } },
      select: { id: true, name: true },
    });
  });

  it("ignore un ministère introuvable", async () => {
    prismaMock.ministry.findMany.mockResolvedValue([]);
    const options = await buildSourceOptions([{ ministryId: "min-x", departments: [dept("d-1", "Son")] }]);
    expect(options).toEqual([{ type: "department", id: "d-1", label: "Son" }]);
  });
});
