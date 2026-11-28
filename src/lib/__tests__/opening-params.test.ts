import { describe, it, expect } from "vitest";
import { accountingFilterFromParam, isOpenFlag, ticketingTodoFromParam, trackingStatusFromParam } from "../opening-params";

/** Paramètres d'ouverture (spec 092) : liste fermée, toute autre valeur ignorée. */
describe("opening-params", () => {
  it("isOpenFlag : « 1 » seulement", () => {
    expect(isOpenFlag("1")).toBe(true);
    // Paramètre répété : seule la première valeur compte.
    expect(isOpenFlag(["1", "0"])).toBe(true);
    expect(isOpenFlag(["0", "1"])).toBe(false);
    for (const v of [undefined, "", "0", "true", "oui", "1 "]) expect(isOpenFlag(v as never)).toBe(false);
  });

  it("trackingStatusFromParam : « soumis » seulement", () => {
    expect(trackingStatusFromParam("soumis")).toBe("SUBMITTED");
    for (const v of [undefined, "", "SUBMITTED", "valide", ["valide", "soumis"]]) expect(trackingStatusFromParam(v as never)).toBe("");
  });

  it("ticketingTodoFromParam : « reglements » seulement", () => {
    expect(ticketingTodoFromParam("reglements")).toBe("reglements");
    for (const v of [undefined, "", "paiements", ["x", "reglements"]]) expect(ticketingTodoFromParam(v as never)).toBeNull();
  });

  it("accountingFilterFromParam : « justifier » seulement", () => {
    expect(accountingFilterFromParam("justifier")).toBe("JUSTIFY");
    for (const v of [undefined, "", "JUSTIFY", "payer", ["payer", "justifier"]]) expect(accountingFilterFromParam(v as never)).toBe("");
  });
});
