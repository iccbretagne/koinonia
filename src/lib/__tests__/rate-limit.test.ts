import { describe, it, expect } from "vitest";
import { rateLimit, requireRateLimit, getClientIp } from "@/lib/rate-limit";

describe("rateLimit", () => {
  it("allows requests within the limit", () => {
    const key = `test-allow-${Date.now()}`;
    const result = rateLimit(key, { max: 5, windowMs: 60_000 });
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("tracks remaining count correctly", () => {
    const key = `test-count-${Date.now()}`;
    const opts = { max: 3, windowMs: 60_000 };

    expect(rateLimit(key, opts).remaining).toBe(2);
    expect(rateLimit(key, opts).remaining).toBe(1);
    expect(rateLimit(key, opts).remaining).toBe(0);
  });

  it("blocks after exceeding the limit", () => {
    const key = `test-block-${Date.now()}`;
    const opts = { max: 2, windowMs: 60_000 };

    expect(rateLimit(key, opts).success).toBe(true);
    expect(rateLimit(key, opts).success).toBe(true);
    expect(rateLimit(key, opts).success).toBe(false);
    expect(rateLimit(key, opts).remaining).toBe(0);
  });

  it("resets after window expires", () => {
    const key = `test-reset-${Date.now()}`;
    const opts = { max: 1, windowMs: 1 };

    expect(rateLimit(key, opts).success).toBe(true);

    // Wait just enough for the window to expire
    const start = Date.now();
    while (Date.now() - start < 5) {
      // busy-wait a few ms
    }

    expect(rateLimit(key, opts).success).toBe(true);
  });

  it("isolates different keys", () => {
    const key1 = `test-isolate-a-${Date.now()}`;
    const key2 = `test-isolate-b-${Date.now()}`;
    const opts = { max: 1, windowMs: 60_000 };

    expect(rateLimit(key1, opts).success).toBe(true);
    expect(rateLimit(key1, opts).success).toBe(false);

    // Different key should still be allowed
    expect(rateLimit(key2, opts).success).toBe(true);
  });

  it("uses default values (60 requests, 60s window)", () => {
    const key = `test-defaults-${Date.now()}`;
    const result = rateLimit(key);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(59);
  });
});

describe("requireRateLimit", () => {
  const req = (ip: string) =>
    new Request("https://example.test/api/x", {
      method: "POST",
      headers: { "x-forwarded-for": `${ip}, 10.0.0.1` },
    });

  it("extrait l'IP client du premier maillon de x-forwarded-for", () => {
    expect(getClientIp(req("203.0.113.7"))).toBe("203.0.113.7");
    expect(getClientIp(new Request("https://example.test/"))).toBe("unknown");
  });

  // Régression : `prefix` REMPLACE la clé au lieu de s'y ajouter. Un préfixe constant
  // (ex. "audio:play") faisait donc un compteur global : une fois le quota atteint par
  // un seul client, tous les autres étaient bloqués. Toute clé doit inclure l'appelant.
  it("isole les compteurs de deux clients quand la clé inclut l'IP", () => {
    const prefix = `test-scoped-${Date.now()}`;
    const opts = { max: 1, windowMs: 60_000 };

    const key = (r: Request) => ({ prefix: `${prefix}:${getClientIp(r)}`, ...opts });

    expect(() => requireRateLimit(req("203.0.113.1"), key(req("203.0.113.1")))).not.toThrow();
    // Le quota du premier client est epuise, le second doit rester servi.
    expect(() => requireRateLimit(req("203.0.113.2"), key(req("203.0.113.2")))).not.toThrow();
    // ... et le premier client, lui, est bien bloque.
    expect(() => requireRateLimit(req("203.0.113.1"), key(req("203.0.113.1")))).toThrow();
  });

  it("un préfixe constant partage le compteur entre tous les clients", () => {
    const prefix = `test-global-${Date.now()}`;
    const opts = { prefix, max: 1, windowMs: 60_000 };

    expect(() => requireRateLimit(req("203.0.113.1"), opts)).not.toThrow();
    expect(() => requireRateLimit(req("203.0.113.2"), opts)).toThrow();
  });
});
