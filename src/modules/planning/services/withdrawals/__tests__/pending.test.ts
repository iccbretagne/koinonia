/** File « Remplacements à trouver » (spec 092) : `planning:edit`, périmètre, événement à venir, rien de nominatif. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import type { Role } from "@/generated/prisma/client";
import { prismaMock } from "@/__mocks__/prisma";
import { createAuthScopeMocks, createSession, fakeHasChurchPermission } from "@/__mocks__/auth";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({ ...createAuthScopeMocks(), hasChurchPermission: fakeHasChurchPermission }));

const { listPendingWithdrawals, pendingWithdrawalsWhere } = await import("../pending");

const NOW = new Date("2026-03-01T10:00:00Z");

function session(role: Role, departmentIds: string[] = [], churchId = "ch1"): Session {
  return createSession({
    churchRoles: [
      {
        id: "r",
        churchId,
        role,
        ministryId: null,
        church: { id: churchId, name: "ICC", slug: "icc" },
        departments: departmentIds.map((id) => ({ department: { id, name: id }, isDeputy: false })),
      },
    ] as Session["user"]["churchRoles"],
  });
}

beforeEach(() => vi.clearAllMocks());

describe("pendingWithdrawalsWhere", () => {
  it("sans planning:edit (Secrétaire, STAR) : aucune file", async () => {
    await expect(pendingWithdrawalsWhere(session("SECRETARY"), "ch1", NOW)).resolves.toBeNull();
    await expect(pendingWithdrawalsWhere(session("STAR"), "ch1", NOW)).resolves.toBeNull();
  });

  it("autre église : aucune file", async () => {
    await expect(pendingWithdrawalsWhere(session("ADMIN", [], "ch2"), "ch1", NOW)).resolves.toBeNull();
  });

  it("Admin : toute l'église, événements à venir", async () => {
    await expect(pendingWithdrawalsWhere(session("ADMIN"), "ch1", NOW)).resolves.toEqual({
      churchId: "ch1",
      status: "PENDING",
      event: { churchId: "ch1", date: { gte: NOW } },
    });
  });

  it("Resp. département : ses départements ; périmètre vide ⇒ rien", async () => {
    expect(await pendingWithdrawalsWhere(session("DEPARTMENT_HEAD", ["d1"]), "ch1", NOW)).toMatchObject({ departmentId: { in: ["d1"] } });
    expect(await pendingWithdrawalsWhere(session("DEPARTMENT_HEAD"), "ch1", NOW)).toMatchObject({ departmentId: { in: [] } });
  });
});

describe("listPendingWithdrawals", () => {
  it("nombre total et premiers éléments, sans le STAR désisté ni son message", async () => {
    prismaMock.serviceWithdrawal.count.mockResolvedValue(7);
    prismaMock.serviceWithdrawal.findMany.mockResolvedValue([
      { id: "w1", event: { title: "Culte", date: NOW }, department: { name: "Son" } },
    ]);
    const res = await listPendingWithdrawals(session("ADMIN"), "ch1", { now: NOW, take: 5 });
    expect(res).toEqual({ count: 7, items: [{ id: "w1", date: NOW, eventTitle: "Culte", departmentName: "Son" }] });
    const select = prismaMock.serviceWithdrawal.findMany.mock.calls[0][0].select;
    expect(Object.keys(select)).toEqual(["id", "event", "department"]);
    expect(prismaMock.serviceWithdrawal.findMany.mock.calls[0][0].take).toBe(5);
  });

  it("sans droit : null, aucune requête", async () => {
    await expect(listPendingWithdrawals(session("STAR"), "ch1", { now: NOW })).resolves.toBeNull();
    expect(prismaMock.serviceWithdrawal.count).not.toHaveBeenCalled();
  });
});
