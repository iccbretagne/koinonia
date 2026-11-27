import { describe, it, expect } from "vitest";
import { paletteActions, type PaletteActionRights } from "../navigation";

/** Actions de la recherche (spec 092, lot 2) : chacune seulement avec sa condition. */

const ALL: Required<PaletteActionRights> = {
  hasAvailability: true,
  hasMembersAccess: true,
  hasCareRequest: true,
  hasEventsManage: true,
  hasAccountingSubmit: true,
  hasTreasury: true,
};

const EXPECTED: Record<keyof PaletteActionRights, [string, string]> = {
  hasAvailability: ["Déclarer une absence", "/disponibilites?declarer=1"],
  hasMembersAccess: ["Nouvelle demande", "/requests/new"],
  hasCareRequest: ["Demander un rendez-vous", "/care/request?new=1"],
  hasEventsManage: ["Nouvel événement", "/admin/events?nouveau=1"],
  hasAccountingSubmit: ["Nouvelle demande comptable", "/accounting/requests/new"],
  hasTreasury: ["Nouvelle saisie de trésorerie", "/accounting/tresorerie?saisie=1"],
};

describe("paletteActions", () => {
  it("aucun droit : aucune action", () => {
    expect(paletteActions({})).toEqual([]);
  });

  it("chaque action n'apparaît qu'avec sa propre condition", () => {
    for (const [right, [label, href]] of Object.entries(EXPECTED)) {
      const actions = paletteActions({ [right]: true });
      expect(actions.map((a) => [a.label, a.href])).toEqual([[label, href]]);
    }
  });

  it("tous les droits : les six actions, dans un ordre fixe, et aucune autre", () => {
    expect(paletteActions(ALL).map((a) => a.href)).toEqual(Object.values(EXPECTED).map(([, href]) => href));
  });
});
