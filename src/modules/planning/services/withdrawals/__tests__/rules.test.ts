import { describe, it, expect } from "vitest";
import { isPlannedStatus, replaceable, withdrawable } from "../rules";

const event = (date: string, planningDeadline: string | null) => ({
  date: new Date(date),
  planningDeadline: planningDeadline ? new Date(planningDeadline) : null,
});

describe("withdrawable", () => {
  it("vrai avant la date limite de planification", () => {
    expect(withdrawable(event("2026-11-08T10:00:00Z", "2026-11-05T20:00:00Z"), new Date("2026-11-05T19:59:00Z"))).toBe(true);
  });

  it("faux une fois la date limite passée, même avant l'événement", () => {
    expect(withdrawable(event("2026-11-08T10:00:00Z", "2026-11-05T20:00:00Z"), new Date("2026-11-06T08:00:00Z"))).toBe(false);
  });

  it("sans date limite : jusqu'au début de l'événement", () => {
    expect(withdrawable(event("2026-11-08T10:00:00Z", null), new Date("2026-11-08T09:59:00Z"))).toBe(true);
    expect(withdrawable(event("2026-11-08T10:00:00Z", null), new Date("2026-11-08T10:00:00Z"))).toBe(false);
  });

  it("faux pour un événement commencé", () => {
    expect(withdrawable(event("2026-11-08T10:00:00Z", null), new Date("2026-11-08T11:00:00Z"))).toBe(false);
  });
});

describe("replaceable", () => {
  it("après l'échéance mais avant le début : oui ; après le début : non", () => {
    const e = { date: new Date("2026-11-08T10:00:00Z") };
    expect(replaceable(e, new Date("2026-11-07T10:00:00Z"))).toBe(true);
    expect(replaceable(e, new Date("2026-11-08T10:30:00Z"))).toBe(false);
  });
});

describe("isPlannedStatus", () => {
  it("les trois statuts de service, pas INDISPONIBLE ni null", () => {
    expect(isPlannedStatus("EN_SERVICE")).toBe(true);
    expect(isPlannedStatus("EN_SERVICE_DEBRIEF")).toBe(true);
    expect(isPlannedStatus("REMPLACANT")).toBe(true);
    expect(isPlannedStatus("INDISPONIBLE")).toBe(false);
    expect(isPlannedStatus(null)).toBe(false);
  });
});
