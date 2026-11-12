/**
 * Tests — formulaire « Nouvelle demande » prérempli par l'adresse (spec 081, brouillon de demande).
 */
import { describe, it, expect } from "vitest";
import { parseRequestPrefill, requestPrefillHref } from "../prefill";

describe("préremplissage d'une demande", () => {
  it("aller-retour : le lien produit se relit à l'identique", () => {
    const prefill = { type: "annonce" as const, titre: "Soirée de louange", texte: "Venez nombreux & invitez !", date: "2026-12-05" };
    const href = requestPrefillHref(prefill);
    expect(href.startsWith("/requests/new?")).toBe(true);
    expect(parseRequestPrefill(Object.fromEntries(new URL(href, "https://x.test").searchParams))).toEqual(prefill);
  });

  it("adresse absente, incomplète ou invalide : formulaire vide, jamais d'erreur", () => {
    expect(parseRequestPrefill({})).toBeUndefined();
    expect(parseRequestPrefill({ type: "virement" })).toBeUndefined();
    expect(parseRequestPrefill({ type: "evenement", date: "05/12/2026" })).toBeUndefined();
    expect(parseRequestPrefill({ type: "visuel", titre: "x".repeat(201) })).toBeUndefined();
  });

  it("aucun identifiant accepté : les champs inconnus sont ignorés", () => {
    expect(parseRequestPrefill({ type: "evenement", titre: "Baptêmes", departmentIds: "d1,d2", typeEvenement: "AUTRE" })).toEqual({
      type: "evenement",
      titre: "Baptêmes",
      typeEvenement: "AUTRE",
    });
  });
});
