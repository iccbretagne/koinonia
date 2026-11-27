import { describe, it, expect } from "vitest";
import { buildSpaces, resolveActive, type NavigationInput } from "../navigation";

/** Entrée « Questionnaires » (Collectes, spec 090) dans l'espace Demandes ; blocs de l'Agenda. */
const base: NavigationInput = { departments: [], configLinks: [], requestLinks: [], mediaLinks: [], homeHref: "/planning" };
const pagesOf = (input: NavigationInput, key: string) => buildSpaces(input).find((s) => s.key === key)?.pages ?? [];

describe("navigation — collectes (spec 090)", () => {
  it("absente sans campagne gérée ni questionnaire à remplir", () => {
    const all = buildSpaces({ ...base, hasEventsAccess: true }).flatMap((s) => s.pages.map((p) => p.href));
    expect(all).not.toContain("/collectes");
  });

  it("dans Demandes, avant le bloc Comptabilité, pour un simple répondant", () => {
    const pages = pagesOf({ ...base, requestLinks: [{ href: "/requests", label: "Mes demandes" }], hasCampaigns: true, hasAccounting: true, hasShuttle: true }, "requests");
    expect(pages.map((p) => p.href)).toEqual(["/requests", "/collectes", "/accounting/requests", "/accounting/navette"]);
    expect(pages[1].label).toBe("Questionnaires");
    expect(pages[1].sidebarBlock).toBeUndefined();
    expect(pagesOf({ ...base, hasCampaigns: true }, "agenda").map((p) => p.href)).not.toContain("/collectes");
  });

  it("aussi dans la vue pastorale (la Pasteure répond au F9)", () => {
    const pages = pagesOf({ ...base, isPastoral: true, hasCampaigns: true }, "requests");
    expect(pages.map((p) => p.href)).toContain("/collectes");
  });

  it("le pilotage d'une campagne et la saisie allument « Questionnaires »", () => {
    const spaces = buildSpaces({ ...base, hasCampaigns: true });
    expect(resolveActive(spaces, "/collectes/c-1")).toEqual({ space: "requests", page: "/collectes" });
    expect(resolveActive(spaces, "/collectes/r/a-1")).toEqual({ space: "requests", page: "/collectes" });
  });

  it("Billetterie et Formulaires forment le bloc « Inscriptions » de l'Agenda", () => {
    const pages = pagesOf({ ...base, hasEventsAccess: true, hasEventsManage: true, hasTicketing: true, hasForms: true }, "agenda");
    expect(pages.filter((p) => p.sidebarBlock === "Inscriptions").map((p) => p.href)).toEqual(["/billetterie", "/formulaires"]);
    expect(pages.filter((p) => p.sidebarBlock === "Église").map((p) => p.href)).toEqual(["/events", "/admin/events", "/admin/welcome-duty"]);
  });
});
