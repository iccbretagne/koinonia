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

const {
  canDepositAnnouncementSheet,
  canReadAnnouncementSheet,
  findCoordinationMinistryId,
} = await import("@/modules/planning");

const COORDINATION_ID = "ministry-coordination";

describe("findCoordinationMinistryId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renvoie l'id du ministère « Coordination générale »", async () => {
    prismaMock.ministry.findFirst.mockResolvedValue({ id: COORDINATION_ID } as never);
    const id = await findCoordinationMinistryId("church-1");
    expect(id).toBe(COORDINATION_ID);
    expect(prismaMock.ministry.findFirst).toHaveBeenCalledWith({
      where: { churchId: "church-1", name: "Coordination générale" },
      select: { id: true },
    });
  });

  it("renvoie null si le ministère n'existe pas", async () => {
    prismaMock.ministry.findFirst.mockResolvedValue(null);
    const id = await findCoordinationMinistryId("church-1");
    expect(id).toBeNull();
  });
});

describe("canDepositAnnouncementSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.memberUserLink.findUnique.mockResolvedValue(null);
  });

  it("autorise events:manage (Admin/Secrétaire — unscoped)", async () => {
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

  it("autorise n'importe quel membre d'un département de la Coordination générale", async () => {
    const session = createStarSession();
    prismaMock.memberUserLink.findUnique.mockResolvedValue({ memberId: "member-1" } as never);
    prismaMock.ministry.findFirst.mockResolvedValue({ id: COORDINATION_ID } as never);
    // 1er appel : appartenance Secrétariat → non. 2e : appartenance Coordination → oui.
    prismaMock.memberDepartment.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    expect(await canDepositAnnouncementSheet(session, "church-1")).toBe(true);
    expect(prismaMock.memberDepartment.count).toHaveBeenLastCalledWith({
      where: { memberId: "member-1", department: { ministryId: COORDINATION_ID } },
    });
  });

  it("autorise le Ministre du ministère Coordination générale", async () => {
    const session = createMinisterSession(COORDINATION_ID);
    prismaMock.memberDepartment.count.mockResolvedValue(0);
    prismaMock.ministry.findFirst.mockResolvedValue({ id: COORDINATION_ID } as never);

    expect(await canDepositAnnouncementSheet(session, "church-1")).toBe(true);
  });

  it("autorise un responsable de département du ministère Coordination générale", async () => {
    const session = createDepartmentHeadSession([{ id: "dept-coord", name: "Logistique" }]);
    prismaMock.memberDepartment.count.mockResolvedValue(0);
    prismaMock.ministry.findFirst.mockResolvedValue({ id: COORDINATION_ID } as never);
    prismaMock.department.count.mockResolvedValue(1);

    expect(await canDepositAnnouncementSheet(session, "church-1")).toBe(true);
    expect(prismaMock.department.count).toHaveBeenCalledWith({
      where: { id: { in: ["dept-coord"] }, ministryId: COORDINATION_ID },
    });
  });

  it("refuse un responsable de département hors Coordination", async () => {
    const session = createDepartmentHeadSession([{ id: "dept-son", name: "Son" }]);
    prismaMock.memberDepartment.count.mockResolvedValue(0);
    prismaMock.ministry.findFirst.mockResolvedValue({ id: COORDINATION_ID } as never);
    prismaMock.department.count.mockResolvedValue(0);

    expect(await canDepositAnnouncementSheet(session, "church-1")).toBe(false);
  });

  it("refuse un Ministre si le ministère Coordination générale n'existe pas", async () => {
    const session = createMinisterSession("ministry-other");
    prismaMock.memberDepartment.count.mockResolvedValue(0);
    prismaMock.ministry.findFirst.mockResolvedValue(null);

    expect(await canDepositAnnouncementSheet(session, "church-1")).toBe(false);
  });

  it("refuse un STAR sans appartenance Secrétariat/Coordination", async () => {
    const session = createStarSession();
    prismaMock.memberUserLink.findUnique.mockResolvedValue({ memberId: "member-1" } as never);
    prismaMock.memberDepartment.count.mockResolvedValue(0);
    prismaMock.ministry.findFirst.mockResolvedValue({ id: COORDINATION_ID } as never);

    expect(await canDepositAnnouncementSheet(session, "church-1")).toBe(false);
  });
});

describe("canReadAnnouncementSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.memberUserLink.findUnique.mockResolvedValue(null);
    prismaMock.memberDepartment.count.mockResolvedValue(0);
    prismaMock.ministry.findFirst.mockResolvedValue(null);
  });

  it("autorise un déposant (sur-ensemble)", async () => {
    const admin = createAdminSession();
    expect(await canReadAnnouncementSheet(admin, "church-1")).toBe(true);
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

  it("autorise un responsable de département, quel que soit son ministère", async () => {
    const session = createDepartmentHeadSession([{ id: "dept-son", name: "Son" }]);
    prismaMock.ministry.findFirst.mockResolvedValue({ id: COORDINATION_ID } as never);
    prismaMock.department.count.mockResolvedValue(0);

    expect(await canReadAnnouncementSheet(session, "church-1")).toBe(true);
  });

  it("refuse un STAR hors de toute population habilitée", async () => {
    const session = createStarSession();
    prismaMock.memberUserLink.findUnique.mockResolvedValue({ memberId: "member-1" } as never);
    prismaMock.memberDepartment.count.mockResolvedValue(0);

    expect(await canReadAnnouncementSheet(session, "church-1")).toBe(false);
  });
});
