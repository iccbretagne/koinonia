/**
 * Tests — questions de données des entretiens (spec 082) : droit de l'écran revérifié, prénom et
 * nom seuls, jamais une coordonnée.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { viewerFor } from "./viewers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
let canManage = true;
vi.mock("@/modules/serving/auth", () => ({ servingActorFromSession: vi.fn(async () => ({ canManage })) }));
vi.mock("@/modules/serving", () => ({
  countToComplete: vi.fn(async () => 1),
  listFreeSlots: vi.fn(async () => [{ id: "s1", startsAt: "2099-12-05T09:00:00.000Z", durationMinutes: 30, location: "Salle 2", visioUrl: false, interviewerName: "Awa Traoré" }]),
}));

const { SERVING_QUESTIONS } = await import("../_data/serving");
const q = (key: string) => SERVING_QUESTIONS.find((x) => x.key === key)!;
const ctx = { session: {} as never, churchId: "c1", params: {}, viewer: viewerFor("STAR", { predicates: ["pvsTeam"] }) };

beforeEach(() => {
  vi.clearAllMocks();
  canManage = true;
});

describe("questions des entretiens", () => {
  it("refus hors équipe Vie des STAR et Admin, sans lecture", async () => {
    canManage = false;
    for (const x of SERVING_QUESTIONS) expect(await x.run(ctx)).toEqual({ refused: true });
    expect(prismaMock.servingApplication.findMany).not.toHaveBeenCalled();
  });

  it("à planifier : prénom, nom et raison, sans coordonnée", async () => {
    prismaMock.servingApplication.findMany.mockResolvedValue([
      { id: "a1", firstName: "Marie", lastName: "Kouassi", schedulingReason: "NO_SLOT", schedulingSince: new Date("2099-11-01T10:00:00Z") },
    ]);
    const answer = await q("serving.toPlan").run(ctx);
    expect(JSON.stringify(answer)).toContain("Marie Kouassi");
    expect(JSON.stringify(answer)).toContain("aucun créneau disponible");
    expect(JSON.stringify(answer)).toContain("1 entretien(s) à compléter");
    const select = prismaMock.servingApplication.findMany.mock.calls[0][0].select;
    expect(Object.keys(select)).not.toEqual(expect.arrayContaining(["email"]));
    expect(select.phone).toBeUndefined();
  });

  it("mes entretiens : ceux que je reçois, dans l'église courante", async () => {
    prismaMock.servingInterview.findMany.mockResolvedValue([]);
    await q("serving.myInterviews").run(ctx);
    expect(prismaMock.servingInterview.findMany.mock.calls[0][0].where).toMatchObject({ interviewerId: "user-1", application: { churchId: "c1" } });
  });

  it("créneaux libres : la personne qui reçoit, jamais le lien de visio", async () => {
    const answer = await q("serving.freeSlots").run(ctx);
    expect(JSON.stringify(answer)).toContain("avec Awa Traoré");
    expect(await q("serving.freeSlots").run({ ...ctx, params: { day: "2099-12-06" } })).toMatchObject({ total: 0 });
  });
});
