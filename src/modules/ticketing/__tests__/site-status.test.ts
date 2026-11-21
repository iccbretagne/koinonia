/** Tests — accessibilité du site publié (spec 084) : adresse finale et avertissements. */
import { describe, it, expect } from "vitest";
import { siteReachability } from "../services/site";

const OK = { slug: "nuit", sitesEnabled: true, baseDomain: "evenements.exemple.org", eventStatus: "OPEN", dedicatedHost: null };

describe("siteReachability", () => {
  it("tout en place : adresse de sous-domaine, aucun avertissement", () => {
    expect(siteReachability(OK)).toEqual({ url: "https://nuit.evenements.exemple.org", warnings: [] });
  });

  it("domaine dédié approuvé : prioritaire, même sans domaine de base", () => {
    expect(siteReachability({ ...OK, baseDomain: undefined, dedicatedHost: "fete.exemple.org" })).toEqual({ url: "https://fete.exemple.org", warnings: [] });
  });

  it("sites non activés par l'église : avertissement, adresse conservée", () => {
    const r = siteReachability({ ...OK, sitesEnabled: false });
    expect(r.url).toBe("https://nuit.evenements.exemple.org");
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("n'a pas activé");
  });

  it("SITE_BASE_DOMAIN absent sans domaine dédié : pas d'adresse, avertissement", () => {
    const r = siteReachability({ ...OK, baseDomain: undefined });
    expect(r.url).toBeNull();
    expect(r.warnings.join(" ")).toContain("SITE_BASE_DOMAIN");
  });

  it("événement en brouillon : avertissement", () => {
    expect(siteReachability({ ...OK, eventStatus: "DRAFT" }).warnings.join(" ")).toContain("brouillon");
    expect(siteReachability({ ...OK, eventStatus: "CLOSED" }).warnings).toEqual([]);
  });

  it("cumule les avertissements", () => {
    expect(siteReachability({ ...OK, sitesEnabled: false, baseDomain: undefined, eventStatus: "DRAFT" }).warnings).toHaveLength(3);
  });
});
