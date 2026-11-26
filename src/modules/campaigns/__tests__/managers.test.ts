/**
 * Tests — gestionnaires des campagnes (spec 090) : le dernier gestionnaire encore membre de
 * l'église ne se retire pas (sous verrou de la campagne), et seuls les gestionnaires encore
 * membres sont prévenus d'une soumission.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const model = () => ({ findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), delete: vi.fn() });
const db = {
  campaign: model(),
  campaignManager: model(),
  campaignAssignment: model(),
  $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(db)),
  $queryRaw: vi.fn(async () => []),
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn(), requireCurrentChurchPermission: vi.fn() }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit }));
const notifyUsers = vi.fn();
vi.mock("@/lib/notifications", () => ({ notifyUsers }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

const { removeManager } = await import("../services/campaigns");
const { notifyAssignmentSubmitted } = await import("../services/notify");

const actor = { userId: "u-admin", name: "Admin" };
const member = { user: { churchRoles: { some: { churchId: "ch1" } } } };

beforeEach(() => {
  vi.clearAllMocks();
  db.campaign.findUnique.mockResolvedValue({ churchId: "ch1" });
  db.campaignManager.findUnique.mockResolvedValue({ userId: "u2" });
});

describe("removeManager", () => {
  it("dernier gestionnaire encore membre : 409 sous le verrou de la campagne, même si d'anciens membres restent inscrits", async () => {
    // u2 est membre ; l'autre ligne restante est un compte qui a quitté l'église (non compté).
    db.campaignManager.count.mockImplementation(async ({ where }: { where: { userId: unknown } }) => (where.userId === "u2" ? 1 : 0));
    await expect(removeManager("cp1", "u2", actor as never)).rejects.toMatchObject({ statusCode: 409 });
    expect(String((db.$queryRaw.mock.calls[0] as unknown[])[0])).toMatch(/campaigns WHERE id = .*FOR UPDATE/);
    expect(db.campaignManager.count).toHaveBeenCalledWith({ where: { campaignId: "cp1", ...member, userId: { not: "u2" } } });
    expect(db.campaignManager.delete).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("un autre gestionnaire membre reste : retrait accepté et journalisé par identifiant", async () => {
    db.campaignManager.count.mockResolvedValue(1);
    await expect(removeManager("cp1", "u2", actor as never)).resolves.toEqual({ deleted: true });
    expect(db.campaignManager.delete).toHaveBeenCalledWith({ where: { campaignId_userId: { campaignId: "cp1", userId: "u2" } } });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ details: { managerId: "u2" } }));
  });

  it("retirer un ancien membre ne retire aucun gestionnaire effectif : accepté", async () => {
    db.campaignManager.count.mockResolvedValue(0);
    await expect(removeManager("cp1", "u2", actor as never)).resolves.toEqual({ deleted: true });
  });
});

describe("notifyAssignmentSubmitted", () => {
  it("seuls les gestionnaires encore membres de l'église de la campagne sont prévenus", async () => {
    db.campaignAssignment.findUnique.mockResolvedValue({
      id: "as1",
      label: "Intégration",
      campaignId: "cp1",
      form: { title: "Intégration" },
      campaign: { title: "F9", churchId: "ch1" },
    });
    db.campaignManager.findMany.mockResolvedValue([{ userId: "u-membre" }]);
    await notifyAssignmentSubmitted("as1");
    expect(db.campaignManager.findMany).toHaveBeenCalledWith({ where: { campaignId: "cp1", ...member }, select: { userId: true } });
    expect(notifyUsers).toHaveBeenCalledWith(["u-membre"], expect.objectContaining({ domain: "campaigns", type: "CAMPAIGN_SUBMITTED" }));
  });

  it("aucun gestionnaire encore membre : personne n'est prévenu", async () => {
    db.campaignAssignment.findUnique.mockResolvedValue({
      id: "as1",
      label: "x",
      campaignId: "cp1",
      form: { title: "y" },
      campaign: { title: "F9", churchId: "ch1" },
    });
    db.campaignManager.findMany.mockResolvedValue([]);
    await notifyAssignmentSubmitted("as1");
    expect(notifyUsers).not.toHaveBeenCalled();
  });
});
