import { describe, it, expect } from "vitest";
import {
  activeDestinationKey,
  bottomDestinations,
  buildSpaces,
  resolveActive,
  ROLE_DESTINATIONS,
  type NavigationInput,
} from "../navigation";
import type { RoleKey } from "../tour-steps";

/** Barre du bas par rôle principal (spec 092, lot 2). */

const base: NavigationInput = { departments: [], configLinks: [], requestLinks: [], mediaLinks: [], homeHref: "/accueil" };

const deptHead: NavigationInput = {
  ...base,
  departments: [{ id: "d1", name: "Choristes", ministryName: "Louange" }],
  requestLinks: [{ href: "/demandes", label: "Mes demandes" }],
  hasPlanningAccess: true,
  hasMembersAccess: true,
  hasEventsAccess: true,
  hasMyPlanning: true,
};

const secretary: NavigationInput = {
  ...deptHead,
  hasPlanningAccess: false,
  hasMyPlanning: false,
  requestLinks: [
    { href: "/demandes", label: "Mes demandes" },
    { href: "/demandes/traitement", label: "Traitement des demandes" },
  ],
};

const accountant: NavigationInput = { ...base, hasAccounting: true, hasAccountingManage: true, hasTreasury: true, hasShuttle: true };

const labels = (input: NavigationInput, role: RoleKey) => bottomDestinations(buildSpaces(input), { role }).map((d) => d.label);

describe("bottomDestinations : liste du rôle principal", () => {
  it("Secrétaire : la file de traitement d'abord", () => {
    expect(labels(secretary, "SECRETARY")).toEqual(["Accueil", "Traitement", "Événements", "Personnes"]);
  });

  it("Comptable : demandes, trésorerie, navette", () => {
    expect(labels(accountant, "ACCOUNTANT")).toEqual(["Accueil", "Demandes", "Trésorerie", "Navette"]);
  });

  it("Resp. département : planning, événements, personnes", () => {
    expect(labels(deptHead, "DEPARTMENT_HEAD")).toEqual(["Accueil", "Planning", "Événements", "Personnes"]);
  });

  it("une destination inaccessible est remplacée par le repli commun, jamais inventée", () => {
    // Comptable sans trésorerie ni navette : aucun repli accessible, la barre se raccourcit.
    expect(labels({ ...accountant, hasTreasury: false, hasShuttle: false }, "ACCOUNTANT")).toEqual(["Accueil", "Demandes"]);
    // Secrétaire sans équipe Secrétariat : le repli prend la place.
    expect(labels({ ...secretary, requestLinks: [{ href: "/demandes", label: "Mes demandes" }] }, "SECRETARY")).toEqual([
      "Accueil",
      "Événements",
      "Personnes",
      "Mes demandes",
    ]);
  });

  it("au plus quatre destinations, sans doublon d'adresse ni formulaire, pour tous les rôles", () => {
    const full: NavigationInput = { ...secretary, ...accountant, hasPlanningAccess: true, hasMyPlanning: true, hasReports: true, hasDiscipleship: true };
    for (const role of Object.keys(ROLE_DESTINATIONS) as RoleKey[]) {
      const list = bottomDestinations(buildSpaces(full), { role });
      expect(list.length).toBeLessThanOrEqual(4);
      const hrefs = list.map((d) => d.href.split("?")[0]);
      expect(new Set(hrefs).size).toBe(hrefs.length);
      expect(new Set(list.map((d) => d.key)).size).toBe(list.length);
      for (const href of hrefs) expect(href).not.toMatch(/\/new$|\/nouvelle$/);
    }
  });

  it("dépend du rôle principal seulement, pas de l'ordre des rôles", () => {
    const spaces = buildSpaces(deptHead);
    expect(bottomDestinations(spaces, { role: "DEPARTMENT_HEAD" })).toEqual(bottomDestinations(spaces, { role: "DEPARTMENT_HEAD" }));
    expect(labels(deptHead, "MINISTER")).toEqual(labels(deptHead, "DEPARTMENT_HEAD"));
  });
});

describe("activeDestinationKey", () => {
  it("allume l'espace de l'écran courant ou de son parent", () => {
    const spaces = buildSpaces(deptHead);
    const list = bottomDestinations(spaces, { role: "DEPARTMENT_HEAD" });
    const at = (pathname: string) => activeDestinationKey(list, resolveActive(spaces, pathname), pathname);
    expect(at("/evenements")).toBe("events");
    expect(at("/planning/departements")).toBe("planning");
    expect(at("/accueil")).toBe("home");
  });

  it("destination de page : allumée sur sa page et, à défaut, sur les pages de son espace", () => {
    const spaces = buildSpaces(accountant);
    const list = bottomDestinations(spaces, { role: "ACCOUNTANT" });
    const at = (pathname: string) => activeDestinationKey(list, resolveActive(spaces, pathname), pathname);
    expect(at("/finances/tresorerie")).toBe("treasury");
    expect(at("/finances/demandes")).toBe("accountingRequests");
  });

  it("aucune destination pour une page hors de la barre : « Plus » s'allume", () => {
    const spaces = buildSpaces(deptHead);
    const list = bottomDestinations(spaces, { role: "DEPARTMENT_HEAD" });
    expect(activeDestinationKey(list, resolveActive(spaces, "/profile"), "/profile")).toBeNull();
  });
});
