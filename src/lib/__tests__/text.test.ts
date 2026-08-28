import { describe, it, expect } from "vitest";
import { normalizeText } from "@/lib/text";

describe("normalizeText", () => {
  it("met en minuscule et retire les accents", () => {
    expect(normalizeText("Prédication")).toBe("predication");
    expect(normalizeText("ÉGLISE À Rennes")).toBe("eglise a rennes");
    expect(normalizeText("Noël")).toBe("noel");
  });

  it("réduit les espaces et trim", () => {
    expect(normalizeText("  Pasteur   Jean  ")).toBe("pasteur jean");
  });

  it("gère null / undefined / vide", () => {
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
    expect(normalizeText("")).toBe("");
    expect(normalizeText("   ")).toBe("");
  });
});
