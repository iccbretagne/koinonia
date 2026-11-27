import { describe, it, expect } from "vitest";
import { buildSpaces, sheetGroups, sidebarBlocks, type NavigationInput } from "../navigation";

/** Panneau « Plus » (spec 092, lot 2) : mêmes blocs que la barre latérale. */

const admin: NavigationInput = {
  departments: [
    { id: "d1", name: "Choristes", ministryName: "Louange" },
    { id: "d2", name: "Musiciens", ministryName: "Louange" },
    { id: "d3", name: "Protocole", ministryName: "Accueil" },
  ],
  configLinks: [{ href: "/admin/departments", label: "Départements" }],
  requestLinks: [
    { href: "/requests", label: "Mes demandes" },
    { href: "/secretariat/requests", label: "Traitement des demandes" },
  ],
  mediaLinks: [{ href: "/audio", label: "Audio" }],
  hasPlanningAccess: true,
  hasMembersAccess: true,
  hasEventsAccess: true,
  hasEventsManage: true,
  hasMyPlanning: true,
  hasAvailability: true,
  hasAccounting: true,
  hasAccountingManage: true,
  hasTreasury: true,
  homeHref: "/accueil",
};

describe("sheetGroups", () => {
  it("reprend, pour chaque espace, les pages et les intitulés de sidebarBlocks", () => {
    for (const space of buildSpaces(admin)) {
      const blocks = sidebarBlocks(space.pages);
      const groups = sheetGroups(space.pages);
      const fromBlocks = blocks.flatMap((b) => [...b.entries, ...b.ministries.flatMap((m) => m.entries)].map((e) => e.page.href));
      expect(groups.flatMap((g) => g.pages.map((p) => p.href))).toEqual(fromBlocks);
      const titles = groups.map((g) => g.name).filter(Boolean);
      for (const b of blocks) if (b.label && b.entries.length > 0) expect(titles).toContain(b.label);
    }
  });

  it("les départements sont rangés par ministère, comme la barre latérale", () => {
    const planning = buildSpaces(admin).find((s) => s.key === "planning")!;
    const names = sheetGroups(planning.pages).map((g) => g.name);
    expect(names).toEqual(expect.arrayContaining(["Louange", "Accueil"]));
  });
});
