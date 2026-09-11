import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import {
  createAdminSession,
  createSecretarySession,
  createDepartmentHeadSession,
  createStarSession,
} from "@/__mocks__/auth";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({
  default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original };
});

const { canManageOpeningClosing, findActiveAbsenceForMember } = await import("@/modules/planning");

describe("canManageOpeningClosing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("autorise events:manage (Admin/Secrétaire/Super Admin — unscoped)", async () => {
    const session = createAdminSession("church-1");
    expect(await canManageOpeningClosing(session, "church-1")).toBe(true);

    const secretary = createSecretarySession("church-1");
    expect(await canManageOpeningClosing(secretary, "church-1")).toBe(true);
  });

  it("autorise un responsable de département de fonction SECURITE", async () => {
    const session = createDepartmentHeadSession([{ id: "dept-securite", name: "Sécurité" }], "church-1");
    prismaMock.department.count.mockResolvedValue(1);

    expect(await canManageOpeningClosing(session, "church-1")).toBe(true);
    expect(prismaMock.department.count).toHaveBeenCalledWith({
      where: { id: { in: ["dept-securite"] }, function: "SECURITE" },
    });
  });

  it("autorise n'importe quel membre du département de fonction SECRETARIAT", async () => {
    const session = createStarSession("church-1");
    prismaMock.memberUserLink.findUnique.mockResolvedValue({ memberId: "member-1" } as never);
    prismaMock.memberDepartment.count.mockResolvedValue(1);

    expect(await canManageOpeningClosing(session, "church-1")).toBe(true);
    expect(prismaMock.memberDepartment.count).toHaveBeenCalledWith({
      where: { memberId: "member-1", department: { function: "SECRETARIAT" } },
    });
  });

  it("refuse un STAR sans appartenance Sécurité ni Secrétariat", async () => {
    const session = createStarSession("church-1");
    prismaMock.memberUserLink.findUnique.mockResolvedValue({ memberId: "member-1" } as never);
    prismaMock.memberDepartment.count.mockResolvedValue(0);

    expect(await canManageOpeningClosing(session, "church-1")).toBe(false);
  });

  it("refuse un responsable de département hors SECURITE, sans compte lié", async () => {
    const session = createDepartmentHeadSession([{ id: "dept-son", name: "Son" }], "church-1");
    prismaMock.department.count.mockResolvedValue(0);
    prismaMock.memberUserLink.findUnique.mockResolvedValue(null);

    expect(await canManageOpeningClosing(session, "church-1")).toBe(false);
  });
});

describe("findActiveAbsenceForMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retourne l'absence si elle chevauche la date de l'événement", async () => {
    const absence = { id: "abs-1", startDate: new Date("2026-09-01"), endDate: new Date("2026-09-15") };
    prismaMock.absence.findFirst.mockResolvedValue(absence as never);

    const result = await findActiveAbsenceForMember("church-1", "member-1", new Date("2026-09-10"));
    expect(result).toEqual(absence);
    expect(prismaMock.absence.findFirst).toHaveBeenCalledWith({
      where: {
        churchId: "church-1",
        memberId: "member-1",
        status: "ACTIVE",
        startDate: { lte: new Date("2026-09-10") },
        endDate: { gte: new Date("2026-09-10") },
      },
      select: { id: true, startDate: true, endDate: true },
    });
  });

  it("retourne null hors période d'absence", async () => {
    prismaMock.absence.findFirst.mockResolvedValue(null);
    const result = await findActiveAbsenceForMember("church-1", "member-1", new Date("2026-09-10"));
    expect(result).toBeNull();
  });

  it("retourne null si aucune absence n'existe", async () => {
    prismaMock.absence.findFirst.mockResolvedValue(null);
    const result = await findActiveAbsenceForMember("church-1", "member-1", new Date("2026-09-10"));
    expect(result).toBeNull();
  });
});
