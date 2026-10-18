import { describe, it, expect } from "vitest";
import { formatIban, ibanError, isValidBic, isValidIban, normalizeBic, normalizeIban } from "../services/iban";

const FR = "FR7630006000011234567890189";

describe("IBAN (spec 065)", () => {
  it.each([
    [FR],
    ["FR76 3000 6000 0112 3456 7890 189"],
    ["fr76 3000 6000 0112 3456 7890 189"],
    ["DE89370400440532013000"],
    ["GB82WEST12345698765432"],
  ])("accepte %s", (iban) => {
    expect(isValidIban(iban)).toBe(true);
    expect(ibanError(iban)).toBeNull();
  });

  it("normalise espaces, tirets et minuscules", () => {
    expect(normalizeIban(" fr76-3000 6000 ")).toBe("FR7630006000");
  });

  it("refuse une clé fausse avec un message explicite", () => {
    expect(isValidIban("FR7630006000011234567890188")).toBe(false);
    expect(ibanError("FR7630006000011234567890188")).toMatch(/clé|contrôle/i);
  });

  it("refuse une longueur incorrecte pour le pays", () => {
    expect(ibanError("FR763000600001123456789018")).toMatch(/26 caractères au lieu de 27/);
  });

  it("refuse des caractères invalides", () => {
    expect(ibanError("FR76 3000 6000 0112 3456 7890 18!")).toMatch(/deux lettres et deux chiffres/);
    expect(ibanError("7630006000011234567890189")).not.toBeNull();
  });

  it("formate par groupes de 4", () => {
    expect(formatIban(FR)).toBe("FR76 3000 6000 0112 3456 7890 189");
    expect(formatIban("fr76 3000 6000 0112 3456 7890 189")).toBe("FR76 3000 6000 0112 3456 7890 189");
  });
});

describe("BIC (spec 065)", () => {
  it("accepte 8 et 11 caractères", () => {
    expect(isValidBic("AGRIFRPP")).toBe(true);
    expect(isValidBic("AGRIFRPP882")).toBe(true);
    expect(isValidBic(normalizeBic(" agrifrpp "))).toBe(true);
  });

  it.each(["AGRI", "AGRIFRPP8", "AGRIFRPP88", "1GRIFRPP"])("refuse %s", (bic) => {
    expect(isValidBic(bic)).toBe(false);
  });
});
