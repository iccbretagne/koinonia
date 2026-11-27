import { describe, it, expect } from "vitest";
import { buildBreadcrumb, buildSpaces, parentLink, resolveActive, type NavigationInput } from "../navigation";

/** Entrée « Questionnaires » (Collectes, spec 090) dans l'espace Demandes ; blocs de l'Agenda. */
const base: NavigationInput = { departments: [], configLinks: [], requestLinks: [], mediaLinks: [], homeHref: "/planning" };
const pagesOf = (input: NavigationInput, key: string) => buildSpaces(input).find((s) => s.key === key)?.pages ?? [];

describe("navigation — collectes (spec 090)", () => {
  it("absente sans campagne gérée ni questionnaire à remplir", () => {
    const all = buildSpaces({ ...base, hasEventsAccess: true }).flatMap((s) => s.pages.map((p) => p.href));
    expect(all).not.toContain("/demandes/questionnaires");
  });

  it("dans Demandes, pour un simple répondant", () => {
    const pages = pagesOf({ ...base, requestLinks: [{ href: "/demandes", label: "Mes demandes" }], hasCampaigns: true, hasAccounting: true, hasShuttle: true }, "requests");
    expect(pages.map((p) => p.href)).toEqual(["/demandes", "/demandes/questionnaires"]);
    expect(pagesOf({ ...base, hasAccounting: true, hasAccountingManage: true, hasShuttle: true }, "finances").map((p) => p.href)).toEqual(["/finances/demandes", "/finances/navette"]);
    expect(pages[1].label).toBe("Questionnaires");
    expect(pages[1].sidebarBlock).toBeUndefined();
    expect(pagesOf({ ...base, hasCampaigns: true }, "events").map((p) => p.href)).not.toContain("/demandes/questionnaires");
  });

  it("aussi dans la vue pastorale (la Pasteure répond au F9)", () => {
    const pages = pagesOf({ ...base, isPastoral: true, hasCampaigns: true }, "requests");
    expect(pages.map((p) => p.href)).toContain("/demandes/questionnaires");
  });

  it("le pilotage d'une campagne et la saisie allument « Questionnaires »", () => {
    const spaces = buildSpaces({ ...base, hasCampaigns: true });
    expect(resolveActive(spaces, "/demandes/questionnaires/c-1")).toEqual({ space: "requests", page: "/demandes/questionnaires" });
    expect(resolveActive(spaces, "/demandes/questionnaires/r/a-1")).toEqual({ space: "requests", page: "/demandes/questionnaires" });
  });

  it("Billetterie et Formulaires forment le bloc « Inscriptions » de l'Agenda", () => {
    const pages = pagesOf({ ...base, hasEventsAccess: true, hasEventsManage: true, hasTicketing: true, hasForms: true }, "events");
    expect(pages.filter((p) => p.sidebarBlock === "Inscriptions").map((p) => p.href)).toEqual(["/evenements/billetterie", "/evenements/formulaires"]);
    expect(pages.filter((p) => p.sidebarBlock === "Église").map((p) => p.href)).toEqual(["/evenements", "/evenements/gestion", "/evenements/service-accueil"]);
  });

  it("fil d'Ariane des sous-pages dans la barre supérieure (pas de faux fil dans la page)", () => {
    const spaces = buildSpaces({ ...base, requestLinks: [{ href: "/demandes", label: "Mes demandes" }], hasCampaigns: true });
    const trail = (path: string) => buildBreadcrumb(spaces, path).map((c) => c.label);
    expect(trail("/demandes/questionnaires")).toEqual(["Demandes", "Questionnaires"]);
    expect(trail("/demandes/questionnaires/nouveau")).toEqual(["Demandes", "Questionnaires", "Nouvelle campagne"]);
    expect(trail("/demandes/questionnaires/import")).toEqual(["Demandes", "Questionnaires", "Import"]);
    expect(trail("/demandes/questionnaires/c-1")).toEqual(["Demandes", "Questionnaires", "Campagne"]);
    expect(trail("/demandes/questionnaires/r/a-1")).toEqual(["Demandes", "Questionnaires", "Contribution"]);
    expect(trail("/demandes/questionnaires/c-1/editer")).toEqual(["Demandes", "Questionnaires", "Campagne", "Modification"]);
    expect(trail("/demandes/questionnaires/c-1/import")).toEqual(["Demandes", "Questionnaires", "Campagne", "Import"]);
    expect(trail("/demandes/questionnaires/c-1/apercu/f-1")).toEqual(["Demandes", "Questionnaires", "Campagne", "Aperçu"]);
    expect(buildBreadcrumb(spaces, "/demandes/questionnaires/c-1/editer")[1]).toEqual({ label: "Questionnaires", href: "/demandes/questionnaires" });
    expect(parentLink(spaces, "/demandes/questionnaires/c-1/editer")).toEqual({ href: "/demandes/questionnaires/c-1", label: "Campagne" });
  });
});
