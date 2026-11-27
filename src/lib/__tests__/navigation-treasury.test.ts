import { describe, it, expect } from "vitest";
import { buildSpaces, resolveActive, type NavigationInput } from "../navigation";

/** Entrée « Trésorerie » dans l'espace Finances (spec 076, lot 1 de la spec 092). */
const base: NavigationInput = {
  departments: [],
  configLinks: [],
  requestLinks: [{ href: "/requests", label: "Mes demandes" }],
  mediaLinks: [],
  homeHref: "/accueil",
};

const financePages = (input: NavigationInput) => buildSpaces(input).find((s) => s.key === "finances")?.pages ?? [];

describe("navigation — trésorerie (spec 076)", () => {
  it("Finances regroupe Demandes comptables, Navette puis Trésorerie", () => {
    const pages = financePages({ ...base, hasAccounting: true, hasAccountingManage: true, hasShuttle: true, hasTreasury: true });
    expect(pages.map((p) => p.label)).toEqual(["Demandes comptables", "Navette", "Trésorerie"]);
  });

  it("sans navette, la trésorerie suffit", () => {
    const pages = financePages({ ...base, hasAccounting: true, hasAccountingManage: true, hasTreasury: true });
    expect(pages.map((p) => p.label)).toEqual(["Demandes comptables", "Trésorerie"]);
  });

  it("sans droit, aucune entrée « Trésorerie »", () => {
    expect(financePages({ ...base, hasAccounting: true, hasAccountingManage: true }).some((p) => p.href === "/accounting/tresorerie")).toBe(false);
  });

  it("/accounting/tresorerie allume « Trésorerie »", () => {
    const spaces = buildSpaces({ ...base, hasAccounting: true, hasAccountingManage: true, hasTreasury: true });
    expect(resolveActive(spaces, "/accounting/tresorerie")).toEqual({ space: "finances", page: "/accounting/tresorerie" });
  });
});
