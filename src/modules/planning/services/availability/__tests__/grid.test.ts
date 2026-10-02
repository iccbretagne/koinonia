import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { getPlanningAvailability } = await import("../grid");

const now = new Date("2026-10-10T10:00:00Z");
const event = { id: "evt-1", date: new Date("2026-11-08T10:00:00Z") };
const closesAt = new Date("2026-11-01T00:00:00Z");

describe("getPlanningAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.availabilityResponse.findMany.mockResolvedValue([]);
    prismaMock.availabilityAsk.findUnique.mockResolvedValue(null);
    prismaMock.availabilityCollection.findUnique.mockResolvedValue(null);
    prismaMock.absence.findMany.mockResolvedValue([]);
    prismaMock.memberUserLink.findMany.mockResolvedValue([]);
    prismaMock.planning.findMany.mockResolvedValue([]);
  });

  it("collecte non ouverte : « Non demandée » pour tous, compteurs à zéro", async () => {
    const res = await getPlanningAvailability("church-1", event, "dept-1", ["m-1", "m-2"], prismaMock as never, now);
    expect(res.asked).toBe(false);
    expect(res.members.get("m-1")?.state).toBe("NOT_ASKED");
    expect(res.counts).toEqual({ available: 0, ifNeeded: 0, noResponse: 0, unavailable: 0 });
  });

  it("collecte ouverte : réponses, « Sans réponse » et compteurs (sans effectif requis)", async () => {
    prismaMock.availabilityCollection.findUnique.mockResolvedValue({ closesAt } as never);
    prismaMock.availabilityResponse.findMany.mockResolvedValue([
      { memberId: "m-1", answer: "AVAILABLE", enteredById: null },
      { memberId: "m-2", answer: "IF_NEEDED", enteredById: null },
      { memberId: "m-3", answer: "UNAVAILABLE", enteredById: null },
    ] as never);

    const res = await getPlanningAvailability("church-1", event, "dept-1", ["m-1", "m-2", "m-3", "m-4"], prismaMock as never, now);

    expect(res.counts).toEqual({ available: 1, ifNeeded: 1, noResponse: 1, unavailable: 1 });
    expect(res.members.get("m-4")).toMatchObject({ state: "NO_RESPONSE", overdue: false });
    expect(res.dueAt).toEqual(closesAt);
  });

  it("après l'échéance, « Sans réponse » est en retard", async () => {
    prismaMock.availabilityCollection.findUnique.mockResolvedValue({ closesAt } as never);
    const res = await getPlanningAvailability("church-1", event, "dept-1", ["m-1"], prismaMock as never, new Date("2026-11-03T00:00:00Z"));
    expect(res.members.get("m-1")).toMatchObject({ state: "NO_RESPONSE", overdue: true });
  });

  it("une réponse explicite l'emporte sur une période active", async () => {
    prismaMock.availabilityCollection.findUnique.mockResolvedValue({ closesAt } as never);
    prismaMock.availabilityResponse.findMany.mockResolvedValue([{ memberId: "m-1", answer: "AVAILABLE", enteredById: null }] as never);
    prismaMock.absence.findMany.mockResolvedValue([
      { id: "abs-1", memberId: "m-1", kind: "PERIOD", startDate: new Date("2026-11-01"), endDate: new Date("2026-11-30"), allDepartments: true, targetDepartments: [], targetEvents: [] },
    ] as never);

    const res = await getPlanningAvailability("church-1", event, "dept-1", ["m-1"], prismaMock as never, now);
    expect(res.members.get("m-1")).toMatchObject({ state: "AVAILABLE", source: "response" });
  });

  it("une période active sans réponse donne « Pas dispo » (source période)", async () => {
    prismaMock.absence.findMany.mockResolvedValue([
      { id: "abs-1", memberId: "m-1", kind: "PERIOD", startDate: new Date("2026-11-01"), endDate: new Date("2026-11-30"), allDepartments: true, targetDepartments: [], targetEvents: [] },
    ] as never);

    const res = await getPlanningAvailability("church-1", event, "dept-1", ["m-1"], prismaMock as never, now);
    expect(res.members.get("m-1")).toMatchObject({ state: "UNAVAILABLE", source: "period" });
    expect(res.counts.unavailable).toBe(1);
  });

  it("signale la réponse saisie par un tiers et le service dans un autre département le même jour", async () => {
    prismaMock.availabilityCollection.findUnique.mockResolvedValue({ closesAt } as never);
    prismaMock.availabilityResponse.findMany.mockResolvedValue([{ memberId: "m-1", answer: "AVAILABLE", enteredById: "resp-1" }] as never);
    prismaMock.memberUserLink.findMany.mockResolvedValue([{ memberId: "m-1", userId: "u-1" }] as never);
    prismaMock.planning.findMany.mockResolvedValue([
      { memberId: "m-1", eventDepartment: { department: { name: "Accueil" } } },
    ] as never);

    const res = await getPlanningAvailability("church-1", event, "dept-1", ["m-1"], prismaMock as never, now);
    expect(res.members.get("m-1")).toMatchObject({ enteredByThirdParty: true, busyElsewhere: ["Accueil"] });
  });
});
