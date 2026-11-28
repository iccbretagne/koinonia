/** File « Questionnaires à valider » de l'Accueil (spec 092) : campagnes que l'on pilote, états seuls. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import type { Role } from "@/generated/prisma/client";
import { createSession } from "@/__mocks__/auth";

const model = () => ({ count: vi.fn(), groupBy: vi.fn() });
const db = { campaign: model(), campaignAssignment: model() };
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));

const { countSubmittedContributions } = await import("../services/queue");

function session(role: Role, churchId = "ch1"): Session {
  return createSession({
    id: "u1",
    churchRoles: [
      { id: "r", churchId, role, ministryId: null, church: { id: churchId, name: "ICC", slug: "icc" }, departments: [] },
    ] as Session["user"]["churchRoles"],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.campaignAssignment.groupBy.mockResolvedValue([{ campaignId: "c1", _count: { _all: 2 } }]);
});

describe("countSubmittedContributions", () => {
  it("campaigns:manage : toutes les campagnes de l'église, contributions SUBMITTED seulement", async () => {
    await expect(countSubmittedContributions(session("ADMIN"), "ch1")).resolves.toEqual({
      count: 2,
      perCampaign: [{ campaignId: "c1", count: 2 }],
    });
    const args = db.campaignAssignment.groupBy.mock.calls[0][0];
    expect(args.where).toEqual({ status: "SUBMITTED", campaign: { churchId: "ch1" } });
    // Aucune valeur de réponse lue : un simple comptage groupé.
    expect(Object.keys(args)).toEqual(["by", "where", "_count"]);
  });

  it("gestionnaire désigné : ses campagnes seulement", async () => {
    db.campaign.count.mockResolvedValue(1);
    await countSubmittedContributions(session("STAR"), "ch1");
    expect(db.campaignAssignment.groupBy.mock.calls[0][0].where).toEqual({
      status: "SUBMITTED",
      campaign: { churchId: "ch1", managers: { some: { userId: "u1" } } },
    });
  });

  it("ne pilote aucune campagne : aucune file (null, pas 0)", async () => {
    db.campaign.count.mockResolvedValue(0);
    db.campaignAssignment.groupBy.mockResolvedValue([]);
    await expect(countSubmittedContributions(session("STAR"), "ch1")).resolves.toBeNull();
  });

  it("autre église : aucune file, aucune requête", async () => {
    await expect(countSubmittedContributions(session("ADMIN", "ch2"), "ch1")).resolves.toBeNull();
    expect(db.campaignAssignment.groupBy).not.toHaveBeenCalled();
  });
});
