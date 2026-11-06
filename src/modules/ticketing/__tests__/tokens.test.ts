import { describe, it, expect, beforeEach } from "vitest";
import { deriveToken, hashToken, isTokenShape, matchesHash, tokenPair } from "../services/tokens";

describe("jetons de la billetterie (spec 074)", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "secret-de-test";
  });

  it("un jeton dérivé est stable, de 64 caractères, et sa portée compte", () => {
    const a = deriveToken("ticket", "p1", "salt");
    expect(isTokenShape(a)).toBe(true);
    expect(deriveToken("ticket", "p1", "salt")).toBe(a);
    expect(deriveToken("manage", "p1", "salt")).not.toBe(a);
    expect(deriveToken("ticket", "p1", "autre-sel")).not.toBe(a);
  });

  it("seule l'empreinte est stockée et se compare à temps constant", () => {
    const { token, hash } = tokenPair("scan", "b1", "salt");
    expect(hash).toBe(hashToken(token));
    expect(hash).not.toContain(token);
    expect(matchesHash(token, hash)).toBe(true);
    expect(matchesHash("0".repeat(64), hash)).toBe(false);
    expect(matchesHash("pas-un-jeton", hash)).toBe(false);
  });

  it("le secret change les jetons", () => {
    const before = deriveToken("ticket", "p1", "salt");
    process.env.TICKETING_TOKEN_SECRET = "autre";
    expect(deriveToken("ticket", "p1", "salt")).not.toBe(before);
    delete process.env.TICKETING_TOKEN_SECRET;
  });
});
