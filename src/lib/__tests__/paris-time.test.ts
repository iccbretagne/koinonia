import { describe, expect, it } from "vitest";
import { parisDateTime, parisParts } from "../paris-time";

describe("parisDateTime", () => {
  it("hiver : UTC+1", () => {
    expect(parisDateTime("2026-12-06", "10:00").toISOString()).toBe("2026-12-06T09:00:00.000Z");
  });
  it("été : UTC+2", () => {
    expect(parisDateTime("2026-07-14", "10:00").toISOString()).toBe("2026-07-14T08:00:00.000Z");
  });
  it("jours de bascule (mars et octobre)", () => {
    expect(parisDateTime("2026-03-29", "12:00").toISOString()).toBe("2026-03-29T10:00:00.000Z");
    expect(parisDateTime("2026-10-25", "12:00").toISOString()).toBe("2026-10-25T11:00:00.000Z");
  });
});

describe("parisParts", () => {
  it("relit le jour et l'heure de Paris", () => {
    expect(parisParts(new Date("2026-12-06T23:30:00Z"))).toEqual({ day: "2026-12-07", time: "00:30", weekday: 1 });
    expect(parisParts(parisDateTime("2026-07-14", "18:45"))).toMatchObject({ day: "2026-07-14", time: "18:45" });
  });
});
