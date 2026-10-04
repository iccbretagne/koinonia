import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createDepartmentHeadSession, createSecretarySession, createStarSession } from "@/__mocks__/auth";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({
  default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original };
});

const { isUpcoming, getStaffingGapViewer, countUnstaffedDepartments } = await import("@/modules/planning");

const NOW = new Date("2026-10-12T14:00:00");

describe("isUpcoming", () => {
  it("compte un événement du jour, même déjà commencé", () => {
    expect(isUpcoming(new Date("2026-10-12T10:00:00"), NOW)).toBe(true);
    expect(isUpcoming(new Date("2026-10-19T10:00:00"), NOW)).toBe(true);
  });

  it("écarte un événement d'un jour passé", () => {
    expect(isUpcoming(new Date("2026-10-11T23:00:00"), NOW)).toBe(false);
  });
});

describe("getStaffingGapViewer", () => {
  it("Admin : tous les départements de l'église, et peut planifier", async () => {
    const viewer = await getStaffingGapViewer(createAdminSession("church-1"), "church-1");
    expect(viewer?.inScope("n-importe-lequel")).toBe(true);
    expect(viewer?.canEdit).toBe(true);
  });

  it("Secrétaire : tous les départements, mais grille en lecture seule (pas planning:edit)", async () => {
    const viewer = await getStaffingGapViewer(createSecretarySession("church-1"), "church-1");
    expect(viewer?.inScope("n-importe-lequel")).toBe(true);
    expect(viewer?.canEdit).toBe(false);
  });

  it("Responsable de département : ses départements seulement", async () => {
    const session = createDepartmentHeadSession([{ id: "d-son", name: "Son" }], "church-1");
    const viewer = await getStaffingGapViewer(session, "church-1");
    expect(viewer?.inScope("d-son")).toBe(true);
    expect(viewer?.inScope("d-parking")).toBe(false);
  });

  it("STAR : aucun signalement", async () => {
    expect(await getStaffingGapViewer(createStarSession("church-1"), "church-1")).toBeNull();
  });

  it("aucun signalement dans une autre église", async () => {
    expect(await getStaffingGapViewer(createAdminSession("church-1"), "church-2")).toBeNull();
  });
});

describe("countUnstaffedDepartments", () => {
  beforeEach(() => vi.clearAllMocks());

  const upcoming = { id: "ev-1", date: new Date("2026-10-19T10:00:00") };
  const past = { id: "ev-0", date: new Date("2026-10-05T10:00:00") };

  it("compte, par événement à venir, les départements du périmètre sans STAR planifié", async () => {
    prismaMock.eventDepartment.findMany.mockResolvedValue([
      { eventId: "ev-1", departmentId: "d-son", _count: { plannings: 0 } },
      { eventId: "ev-1", departmentId: "d-parking", _count: { plannings: 0 } },
      { eventId: "ev-1", departmentId: "d-chorale", _count: { plannings: 3 } },
    ] as never);
    const viewer = { inScope: (id: string) => id !== "d-parking", canEdit: true };

    const counts = await countUnstaffedDepartments([upcoming, past], viewer, NOW);

    expect(counts.get("ev-1")).toBe(1);
    expect(counts.has("ev-0")).toBe(false);
    // Seuls les événements à venir sont interrogés, et seuls les statuts « planifié » comptent.
    expect(prismaMock.eventDepartment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: { in: ["ev-1"] } },
        select: expect.objectContaining({
          _count: {
            select: { plannings: { where: { status: { in: ["EN_SERVICE", "EN_SERVICE_DEBRIEF", "REMPLACANT"] } } } },
          },
        }),
      })
    );
  });

  it("n'interroge pas la base sans événement à venir", async () => {
    const counts = await countUnstaffedDepartments([past], { inScope: () => true, canEdit: true }, NOW);
    expect(counts.size).toBe(0);
    expect(prismaMock.eventDepartment.findMany).not.toHaveBeenCalled();
  });
});
