import { describe, it, expect } from "vitest";
import { isDirty, publicationStatus, toDraft } from "../settings-state";
import { content } from "./fixtures";

describe("modifications non enregistrées (spec 067)", () => {
  const saved = toDraft(content);

  it("rien à signaler au chargement", () => {
    expect(isDirty(toDraft(content), saved)).toBe(false);
  });

  it("signale une saisie", () => {
    expect(isDirty({ ...saved, transferReference: "Offrande" }, saved)).toBe(true);
  });

  it("ne signale plus rien après retour à la valeur d'origine", () => {
    const edited = { ...saved, intro: "Autre" };
    expect(isDirty({ ...edited, intro: saved.intro }, saved)).toBe(false);
  });

  it("ignore un IBAN seulement reformaté et les espaces de bord", () => {
    expect(isDirty({ ...saved, iban: "fr76 3000 6000 0112 3456 7890 189" }, saved)).toBe(false);
    expect(isDirty({ ...saved, intro: `  ${saved.intro}  ` }, saved)).toBe(false);
  });

  it("compte les interrupteurs et la taille du nom", () => {
    expect(isDirty({ ...saved, onsiteEnabled: false }, saved)).toBe(true);
    expect(isDirty({ ...saved, slideChurchNameSize: "SMALL" }, saved)).toBe(true);
  });
});

describe("statut de publication (spec 067)", () => {
  it.each([
    [true, true, "success", "Publiée", null],
    [false, false, "neutral", "Non publiée", null],
    [false, true, "neutral", "Non publiée", "Sera publiée à l'enregistrement"],
    [true, false, "success", "Publiée", "Sera retirée à l'enregistrement"],
  ] as const)("enregistrée %s, brouillon %s", (savedEnabled, draftEnabled, tone, label, pending) => {
    expect(publicationStatus(savedEnabled, draftEnabled)).toEqual({ tone, label, pending });
  });
});
