import { describe, it, expect } from "vitest";
import { parseEmailList, formatEmailList } from "@/lib/email";

describe("parseEmailList", () => {
  it("retourne une liste vide pour null/undefined/chaîne vide", () => {
    expect(parseEmailList(null)).toEqual([]);
    expect(parseEmailList(undefined)).toEqual([]);
    expect(parseEmailList("")).toEqual([]);
  });

  it("parse une seule adresse", () => {
    expect(parseEmailList("compta@icc.fr")).toEqual(["compta@icc.fr"]);
  });

  it("parse plusieurs adresses séparées par virgule", () => {
    expect(parseEmailList("a@icc.fr,b@icc.fr")).toEqual(["a@icc.fr", "b@icc.fr"]);
  });

  it("parse plusieurs adresses séparées par point-virgule", () => {
    expect(parseEmailList("a@icc.fr;b@icc.fr")).toEqual(["a@icc.fr", "b@icc.fr"]);
  });

  it("parse plusieurs adresses séparées par retour à la ligne", () => {
    expect(parseEmailList("a@icc.fr\nb@icc.fr")).toEqual(["a@icc.fr", "b@icc.fr"]);
  });

  it("déduplique les adresses (insensible à la casse)", () => {
    expect(parseEmailList("a@icc.fr, A@ICC.FR, a@icc.fr")).toEqual(["a@icc.fr"]);
  });

  it("retire les espaces superflus et normalise en minuscules", () => {
    expect(parseEmailList("  A@ICC.FR  ,  b@icc.fr  ")).toEqual(["a@icc.fr", "b@icc.fr"]);
  });

  it("ignore les segments vides (séparateurs consécutifs)", () => {
    expect(parseEmailList("a@icc.fr,,b@icc.fr,")).toEqual(["a@icc.fr", "b@icc.fr"]);
  });
});

describe("formatEmailList", () => {
  it("retourne null pour une liste vide", () => {
    expect(formatEmailList([])).toBeNull();
  });

  it("formate une seule adresse", () => {
    expect(formatEmailList(["compta@icc.fr"])).toBe("compta@icc.fr");
  });

  it("formate plusieurs adresses séparées par virgule", () => {
    expect(formatEmailList(["a@icc.fr", "b@icc.fr"])).toBe("a@icc.fr, b@icc.fr");
  });

  it("déduplique et normalise avant de formater", () => {
    expect(formatEmailList(["A@ICC.FR", " a@icc.fr "])).toBe("a@icc.fr");
  });
});
