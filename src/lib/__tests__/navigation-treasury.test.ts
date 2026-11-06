import { describe, it, expect } from "vitest";
import { buildSpaces, resolveActive, sidebarBlocks, type NavigationInput } from "../navigation";

/** Entrée « Trésorerie » rangée sous « Comptabilité » (spec 076). */
const base: NavigationInput = {
  departments: [],
  configLinks: [],
  requestLinks: [{ href: "/requests", label: "Mes demandes" }],
  mediaLinks: [],
  homeHref: "/accueil",
};

const requestPages = (input: NavigationInput) => buildSpaces(input).find((s) => s.key === "requests")?.pages ?? [];

describe("navigation — trésorerie (spec 076)", () => {
  it("le bloc « Comptabilité » regroupe Demandes, Navette puis Trésorerie", () => {
    const pages = requestPages({ ...base, hasAccounting: true, hasShuttle: true, hasTreasury: true });
    const accounting = sidebarBlocks(pages).find((b) => b.label === "Comptabilité");
    expect(accounting?.entries.map((e) => e.label)).toEqual(["Demandes", "Navette", "Trésorerie"]);
  });

  it("sans navette, la trésorerie suffit à former le bloc", () => {
    const pages = requestPages({ ...base, hasAccounting: true, hasTreasury: true });
    const accounting = sidebarBlocks(pages).find((b) => b.label === "Comptabilité");
    expect(accounting?.entries.map((e) => e.label)).toEqual(["Demandes", "Trésorerie"]);
  });

  it("sans droit, aucune entrée « Trésorerie »", () => {
    expect(requestPages({ ...base, hasAccounting: true }).some((p) => p.href === "/accounting/tresorerie")).toBe(false);
  });

  it("/accounting/tresorerie allume « Trésorerie », pas « Comptabilité »", () => {
    const spaces = buildSpaces({ ...base, hasAccounting: true, hasTreasury: true });
    expect(resolveActive(spaces, "/accounting/tresorerie")).toEqual({ space: "requests", page: "/accounting/tresorerie" });
  });
});
