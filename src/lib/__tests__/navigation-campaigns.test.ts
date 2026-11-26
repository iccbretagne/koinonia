import { describe, it, expect } from "vitest";
import { buildSpaces, resolveActive, type NavigationInput } from "../navigation";

/** Entrée « Collectes » dans l'espace Agenda (spec 090). */
const base: NavigationInput = { departments: [], configLinks: [], requestLinks: [], mediaLinks: [], homeHref: "/planning" };
const agenda = (input: NavigationInput) => buildSpaces(input).find((s) => s.key === "agenda")?.pages ?? [];

describe("navigation — collectes (spec 090)", () => {
  it("absente sans campagne gérée ni questionnaire à remplir", () => {
    expect(agenda({ ...base, hasEventsAccess: true }).map((p) => p.href)).not.toContain("/collectes");
  });

  it("présente dans l'Agenda, bloc « Église », pour un simple répondant", () => {
    const pages = agenda({ ...base, hasCampaigns: true });
    expect(pages.find((p) => p.href === "/collectes")).toMatchObject({ label: "Collectes", sidebarBlock: "Église" });
  });

  it("le pilotage d'une campagne et la saisie allument « Collectes »", () => {
    const spaces = buildSpaces({ ...base, hasCampaigns: true });
    expect(resolveActive(spaces, "/collectes/c-1")).toEqual({ space: "agenda", page: "/collectes" });
    expect(resolveActive(spaces, "/collectes/r/a-1")).toEqual({ space: "agenda", page: "/collectes" });
  });
});
