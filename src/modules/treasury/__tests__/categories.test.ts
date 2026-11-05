import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const { ensureDefaults } = await import("../services/defaults");
const { deleteCategory, deletePurpose } = await import("../services/categories");
const { DEFAULT_CATEGORIES } = await import("../schemas");

const actor = { id: "compta-1" };

async function rejection(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e as { statusCode?: number; message: string };
  }
  throw new Error("aucun refus");
}

describe("catégories de trésorerie (spec 076)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crée les catégories par défaut une seule fois, avec les catégories système", async () => {
    prismaMock.treasuryCategory.count.mockResolvedValueOnce(0);
    await ensureDefaults("church-1");
    const data = prismaMock.treasuryCategory.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(data.filter((c: { system: string | null }) => c.system).map((c: { system: string }) => c.system).sort()).toEqual([
      "DEPOSIT",
      "EXPENSE_REPORTS",
      "SHUTTLE",
      "SPECIAL_OFFERING",
    ]);
    prismaMock.treasuryCategory.count.mockResolvedValueOnce(17);
    await ensureDefaults("church-1");
    expect(prismaMock.treasuryCategory.createMany).toHaveBeenCalledTimes(1);
  });

  it("une catégorie utilisée ou système ne se supprime pas : elle se désactive", async () => {
    prismaMock.treasuryCategory.findUnique.mockResolvedValueOnce({ id: "c", churchId: "church-1", system: "DEPOSIT" });
    expect((await rejection(deleteCategory("c", actor))).statusCode).toBe(409);
    prismaMock.treasuryCategory.findUnique.mockResolvedValueOnce({ id: "c", churchId: "church-1", system: null });
    prismaMock.treasuryEntry.count.mockResolvedValueOnce(3);
    prismaMock.treasuryBudget.count.mockResolvedValueOnce(0);
    expect((await rejection(deleteCategory("c", actor))).message).toContain("désactivez-la");
    prismaMock.treasuryCategory.findUnique.mockResolvedValueOnce({ id: "c", churchId: "church-1", system: null });
    prismaMock.treasuryEntry.count.mockResolvedValueOnce(0);
    prismaMock.treasuryBudget.count.mockResolvedValueOnce(0);
    await deleteCategory("c", actor);
    expect(prismaMock.treasuryCategory.delete).toHaveBeenCalledWith({ where: { id: "c" } });
  });

  it("un objet utilisé ne se supprime pas", async () => {
    prismaMock.treasuryPurpose.findUnique.mockResolvedValueOnce({ id: "p", churchId: "church-1", name: "Missions", active: true });
    prismaMock.treasuryEntry.count.mockResolvedValueOnce(1);
    expect((await rejection(deletePurpose("p", actor))).statusCode).toBe(409);
  });
});
