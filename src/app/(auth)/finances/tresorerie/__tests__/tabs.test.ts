import { describe, it, expect } from "vitest";
import { TREASURY_TABS } from "../tabs";

describe("onglets de la trésorerie (spec 076)", () => {
  it("sont un tableau ordinaire, lisible par la page serveur", () => {
    expect(Array.isArray(TREASURY_TABS)).toBe(true);
    expect(TREASURY_TABS.find((t) => t === "remise")).toBe("remise");
    expect(TREASURY_TABS[0]).toBe("tableau");
    expect(new Set(TREASURY_TABS).size).toBe(TREASURY_TABS.length);
  });
});
