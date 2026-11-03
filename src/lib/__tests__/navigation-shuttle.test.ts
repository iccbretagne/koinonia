import { describe, it, expect } from "vitest";
import { buildSpaces, resolveActive, sidebarBlocks, type NavigationInput } from "../navigation";

/** Entrée « Navette » rangée sous « Comptabilité » (spec 073). */
const base: NavigationInput = {
  departments: [],
  configLinks: [],
  requestLinks: [{ href: "/requests", label: "Mes demandes" }],
  mediaLinks: [],
  homeHref: "/planning",
};

const requestPages = (input: NavigationInput) => buildSpaces(input).find((s) => s.key === "requests")?.pages ?? [];

describe("navigation — navette (spec 073)", () => {
  it("sans navette, « Comptabilité » reste une entrée simple", () => {
    const pages = requestPages({ ...base, hasAccounting: true });
    expect(pages.map((p) => p.label)).toEqual(["Mes demandes", "Comptabilité"]);
    expect(pages.find((p) => p.label === "Comptabilité")?.sidebarBlock).toBeUndefined();
  });

  it("avec la navette, un bloc « Comptabilité » regroupe Demandes puis Navette", () => {
    const pages = requestPages({ ...base, hasAccounting: true, hasShuttle: true });
    const blocks = sidebarBlocks(pages);
    const accounting = blocks.find((b) => b.label === "Comptabilité");
    expect(accounting?.entries.map((e) => e.label)).toEqual(["Demandes", "Navette"]);
  });

  it("un STAR de l'équipe sans comptabilité ne voit que « Navette »", () => {
    const pages = requestPages({ ...base, hasShuttle: true });
    expect(pages.map((p) => p.href)).toEqual(["/requests", "/accounting/navette"]);
  });

  it("/accounting/navette allume « Navette », pas « Comptabilité »", () => {
    const spaces = buildSpaces({ ...base, hasAccounting: true, hasShuttle: true });
    expect(resolveActive(spaces, "/accounting/navette")).toEqual({ space: "requests", page: "/accounting/navette" });
    expect(resolveActive(spaces, "/accounting/requests/abc")).toEqual({ space: "requests", page: "/accounting/requests" });
  });
});
