import { describe, it, expect } from "vitest";
import { isAbsencePast } from "../absence-lock";

describe("isAbsencePast", () => {
  const endDate = new Date("2026-09-10").toISOString(); // minuit UTC, comme le formulaire

  it("n'est pas passée pendant son dernier jour", () => {
    expect(isAbsencePast(endDate, new Date("2026-09-10T00:00:00Z"))).toBe(false);
    expect(isAbsencePast(endDate, new Date("2026-09-10T23:59:59.999Z"))).toBe(false);
  });

  it("est passée dès le lendemain", () => {
    expect(isAbsencePast(endDate, new Date("2026-09-11T00:00:00Z"))).toBe(true);
  });

  it("accepte une Date comme une chaîne ISO", () => {
    expect(isAbsencePast(new Date(endDate), new Date("2026-09-12T08:00:00Z"))).toBe(true);
  });
});
