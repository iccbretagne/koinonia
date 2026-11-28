import { describe, it, expect } from "vitest";
import { buildSpaces, resolveActive, type NavigationInput } from "../navigation";

/** Entrée « Navette » dans l'espace Finances (spec 073, lot 1 de la spec 092). */
const base: NavigationInput = {
  departments: [],
  configLinks: [],
  requestLinks: [{ href: "/demandes", label: "Mes demandes" }],
  mediaLinks: [],
  homeHref: "/planning",
};

const financePages = (input: NavigationInput) => buildSpaces(input).find((s) => s.key === "finances")?.pages ?? [];

describe("navigation — navette (spec 073)", () => {
  it("sans navette, « Demandes comptables » reste une entrée simple de l'espace Finances", () => {
    const pages = financePages({ ...base, hasAccounting: true, hasAccountingManage: true });
    expect(pages.map((p) => p.label)).toEqual(["Demandes comptables"]);
  });

  it("avec la navette, Finances regroupe Demandes comptables puis Navette", () => {
    const pages = financePages({ ...base, hasAccounting: true, hasAccountingManage: true, hasShuttle: true });
    expect(pages.map((p) => p.label)).toEqual(["Demandes comptables", "Navette"]);
  });

  it("un STAR de l'équipe sans comptabilité ne voit que « Navette », hors de Demandes", () => {
    const pages = financePages({ ...base, hasShuttle: true });
    expect(pages.map((p) => p.href)).toEqual(["/finances/navette"]);
    expect(buildSpaces({ ...base, hasShuttle: true }).find((s) => s.key === "requests")?.pages.map((p) => p.href)).toEqual(["/demandes"]);
  });

  it("/finances/navette allume « Navette », pas « Demandes comptables »", () => {
    const spaces = buildSpaces({ ...base, hasAccounting: true, hasAccountingManage: true, hasShuttle: true });
    expect(resolveActive(spaces, "/finances/navette")).toEqual({ space: "finances", page: "/finances/navette" });
    expect(resolveActive(spaces, "/finances/demandes/abc")).toEqual({ space: "finances", page: "/finances/demandes" });
  });
});
