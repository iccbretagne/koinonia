import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import {
  createAdminSession,
  createSecretarySession,
  createStarSession,
  createMinisterSession,
  createDepartmentHeadSession,
} from "@/__mocks__/auth";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({
  default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original };
});

const { canDepositAnnouncementSheet, canReadAnnouncementSheet } = await import("@/modules/planning");

describe("canDepositAnnouncementSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.memberUserLink.findUnique.mockResolvedValue(null);
  });

  it("autorise Admin et Secrétaire (périmètre non restreint)", async () => {
    const admin = createAdminSession();
    expect(await canDepositAnnouncementSheet(admin, "church-1")).toBe(true);

    const secretary = createSecretarySession();
    expect(await canDepositAnnouncementSheet(secretary, "church-1")).toBe(true);
  });

  it("autorise n'importe quel membre du département de fonction SECRETARIAT", async () => {
    const session = createStarSession();
    prismaMock.memberUserLink.findUnique.mockResolvedValue({ memberId: "member-1" } as never);
    prismaMock.memberDepartment.count.mockResolvedValue(1);

    expect(await canDepositAnnouncementSheet(session, "church-1")).toBe(true);
    expect(prismaMock.memberDepartment.count).toHaveBeenCalledWith({
      where: { memberId: "member-1", department: { function: "SECRETARIAT" } },
    });
  });

  it("refuse un Ministre (lecture seule)", async () => {
    const session = createMinisterSession("ministry-coordination");
    expect(await canDepositAnnouncementSheet(session, "church-1")).toBe(false);
  });

  it("refuse un responsable de département (lecture seule)", async () => {
    const session = createDepartmentHeadSession([{ id: "dept-coord", name: "Logistique" }]);
    expect(await canDepositAnnouncementSheet(session, "church-1")).toBe(false);
  });

  it("refuse un STAR hors Secrétariat", async () => {
    const session = createStarSession();
    prismaMock.memberUserLink.findUnique.mockResolvedValue({ memberId: "member-1" } as never);
    prismaMock.memberDepartment.count.mockResolvedValue(0);

    expect(await canDepositAnnouncementSheet(session, "church-1")).toBe(false);
  });
});

describe("canReadAnnouncementSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.memberUserLink.findUnique.mockResolvedValue(null);
    prismaMock.memberDepartment.count.mockResolvedValue(0);
  });

  it("autorise un déposant (sur-ensemble)", async () => {
    const admin = createAdminSession();
    expect(await canReadAnnouncementSheet(admin, "church-1")).toBe(true);
  });

  it("autorise un Ministre, quel que soit son ministère", async () => {
    const session = createMinisterSession("ministry-louange");
    expect(await canReadAnnouncementSheet(session, "church-1")).toBe(true);
  });

  it("autorise un responsable de département, quel que soit son ministère", async () => {
    const session = createDepartmentHeadSession([{ id: "dept-son", name: "Son" }]);
    expect(await canReadAnnouncementSheet(session, "church-1")).toBe(true);
  });

  it("autorise un membre STAR du département Modération", async () => {
    const session = createStarSession();
    prismaMock.memberUserLink.findUnique.mockResolvedValue({ memberId: "member-1" } as never);
    // Premier appel (vérif Secrétariat dans canDepositAnnouncementSheet) : refusé.
    // Second appel (vérif Modération) : autorisé.
    prismaMock.memberDepartment.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    expect(await canReadAnnouncementSheet(session, "church-1")).toBe(true);
    expect(prismaMock.memberDepartment.count).toHaveBeenLastCalledWith({
      where: { memberId: "member-1", department: { function: "MODERATION" } },
    });
  });

  it("refuse un STAR hors de toute population habilitée", async () => {
    const session = createStarSession();
    prismaMock.memberUserLink.findUnique.mockResolvedValue({ memberId: "member-1" } as never);

    expect(await canReadAnnouncementSheet(session, "church-1")).toBe(false);
  });
});
