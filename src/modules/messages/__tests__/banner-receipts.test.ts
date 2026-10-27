import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { getActiveBannerMessages } = await import("../services/banner");
const { recordReceipt } = await import("../services/receipts");

const ALL = { roles: [], ministryIds: [], departmentIds: [], headsOnly: false };
const viewer = { userId: "u1", churchIds: ["C1"] };
const HOUR = 3600 * 1000;

function msg(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    churchId: "C1",
    title: id,
    body: "…",
    severity: "INFO",
    audience: ALL,
    startsAt: new Date(Date.now() - HOUR),
    receipts: [],
    ...overrides,
  };
}

describe("bandeau et reçus des messages système (spec 071)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // u1 : STAR dans C1.
    prismaMock.userChurchRole.findMany.mockResolvedValue([
      { userId: "u1", role: "STAR", ministryId: null, departments: [] },
    ]);
    prismaMock.memberUserLink.findMany.mockResolvedValue([]);
    prismaMock.systemMessageReceipt.upsert.mockResolvedValue({});
  });

  it("messages de la période, de ses églises ou de l'instance", async () => {
    prismaMock.systemMessage.findMany.mockResolvedValue([]);
    const now = new Date();
    await getActiveBannerMessages(viewer, now);
    expect(prismaMock.systemMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          withdrawnAt: null,
          startsAt: { lte: now },
          endsAt: { gt: now },
          OR: [{ churchId: { in: ["C1"] } }, { churchId: null }],
        },
      })
    );
  });

  it("filtre le public, exclut les fermés sauf urgent, trie par sévérité", async () => {
    prismaMock.systemMessage.findMany.mockResolvedValue([
      msg("info"),
      msg("important", { severity: "IMPORTANT" }),
      msg("urgent-ferme", { severity: "URGENT", receipts: [{ dismissedAt: new Date() }] }),
      msg("ferme", { receipts: [{ dismissedAt: new Date() }] }),
      msg("admins", { audience: { ...ALL, roles: ["ADMIN"] } }),
      msg("instance", { churchId: null, startsAt: new Date(Date.now() - 2 * HOUR) }),
    ]);
    const banner = await getActiveBannerMessages(viewer);
    expect(banner.map((m) => m.id)).toEqual(["urgent-ferme", "important", "info", "instance"]);
  });

  it("sans église : rien", async () => {
    expect(await getActiveBannerMessages({ userId: "u1", churchIds: [] })).toEqual([]);
    expect(prismaMock.systemMessage.findMany).not.toHaveBeenCalled();
  });

  it("« vu » : idempotent, ne ferme pas", async () => {
    prismaMock.systemMessage.findUnique.mockResolvedValue({ churchId: "C1", audience: ALL, severity: "INFO" });
    await recordReceipt("m1", viewer, "seen");
    expect(prismaMock.systemMessageReceipt.upsert).toHaveBeenCalledWith({
      where: { messageId_userId: { messageId: "m1", userId: "u1" } },
      create: { messageId: "m1", userId: "u1", dismissedAt: null },
      update: {},
    });
  });

  it("« fermé » : date de fermeture ; refusé pour un urgent", async () => {
    prismaMock.systemMessage.findUnique.mockResolvedValue({ churchId: "C1", audience: ALL, severity: "INFO" });
    await recordReceipt("m1", viewer, "dismiss");
    expect(prismaMock.systemMessageReceipt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { dismissedAt: expect.any(Date) } })
    );

    prismaMock.systemMessage.findUnique.mockResolvedValue({ churchId: "C1", audience: ALL, severity: "URGENT" });
    await expect(recordReceipt("m1", viewer, "dismiss")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("hors public ou autre église : 404", async () => {
    prismaMock.systemMessage.findUnique.mockResolvedValue({ churchId: "C2", audience: ALL, severity: "INFO" });
    await expect(recordReceipt("m1", viewer, "seen")).rejects.toMatchObject({ statusCode: 404 });
    prismaMock.systemMessage.findUnique.mockResolvedValue({
      churchId: "C1",
      audience: { ...ALL, roles: ["ADMIN"] },
      severity: "INFO",
    });
    await expect(recordReceipt("m1", viewer, "seen")).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.systemMessageReceipt.upsert).not.toHaveBeenCalled();
  });
});
