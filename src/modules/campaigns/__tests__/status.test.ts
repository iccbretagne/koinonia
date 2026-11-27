/**
 * Tests — ouverture d'une campagne (spec 090, BUG-COLLECTE-001) : refusée tant qu'un destinataire
 * n'a aucun répondant valide (compte encore membre de l'église ou lien personnel actif), pour
 * l'écran comme pour le MCP (même service).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = {
  campaign: { findUnique: vi.fn(), updateMany: vi.fn() },
  campaignAssignment: { findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn(), requireCurrentChurchPermission: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notifyUsers: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
const notifyCampaignOpened = vi.fn();
vi.mock("../services/notify", () => ({ notifyCampaignOpened, notifyAssignmentSubmitted: vi.fn() }));

const { changeCampaignStatus, assignmentsWithoutRespondent } = await import("../services/campaigns");
const actor = { userId: "u1", name: "Admin" };
const draft = { churchId: "ch1", status: "DRAFT", openedAt: null, _count: { assignments: 4 } };

beforeEach(() => {
  vi.clearAllMocks();
  db.campaign.findUnique.mockResolvedValue(draft);
  db.campaign.updateMany.mockResolvedValue({ count: 1 });
});

describe("assignmentsWithoutRespondent", () => {
  it("cherche les destinataires sans compte membre ni lien actif, libellés « questionnaire › destinataire »", async () => {
    db.campaignAssignment.findMany.mockResolvedValue([{ label: "Rennes", form: { title: "Intégration" } }]);
    await expect(assignmentsWithoutRespondent("cp1", "ch1")).resolves.toEqual(["Intégration › Rennes"]);
    expect(db.campaignAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          campaignId: "cp1",
          respondents: { none: { OR: [{ tokenHash: { not: null } }, { user: { churchRoles: { some: { churchId: "ch1" } } } }] } },
        },
      })
    );
  });
});

describe("changeCampaignStatus", () => {
  it("ouverture refusée (409) et rien n'est modifié tant qu'un destinataire n'a pas de répondant", async () => {
    db.campaignAssignment.findMany.mockResolvedValue([
      { label: "Rennes", form: { title: "Intégration" } },
      { label: "Compta", form: { title: "Comptabilité" } },
    ]);
    await expect(changeCampaignStatus("cp1", "open", actor as never)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/2 destinataire\(s\) sans répondant — Intégration › Rennes ; Comptabilité › Compta/),
    });
    expect(db.campaign.updateMany).not.toHaveBeenCalled();
    expect(notifyCampaignOpened).not.toHaveBeenCalled();
  });

  it("réouverture soumise à la même règle", async () => {
    db.campaign.findUnique.mockResolvedValue({ ...draft, status: "CLOSED", openedAt: new Date() });
    db.campaignAssignment.findMany.mockResolvedValue([{ label: "Rennes", form: { title: "Intégration" } }]);
    await expect(changeCampaignStatus("cp1", "reopen", actor as never)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("tous les destinataires pourvus : ouverture appliquée et annoncée", async () => {
    db.campaignAssignment.findMany.mockResolvedValue([]);
    db.campaign.findUnique.mockResolvedValueOnce(draft).mockResolvedValueOnce({ id: "cp1", status: "OPEN" });
    await expect(changeCampaignStatus("cp1", "open", actor as never)).resolves.toMatchObject({ status: "OPEN" });
    expect(db.campaign.updateMany).toHaveBeenCalled();
    expect(notifyCampaignOpened).toHaveBeenCalledWith("cp1");
  });

  it("clôture : pas de contrôle des répondants", async () => {
    db.campaign.findUnique.mockResolvedValue({ ...draft, status: "OPEN" });
    await changeCampaignStatus("cp1", "close", actor as never);
    expect(db.campaignAssignment.findMany).not.toHaveBeenCalled();
  });
});
