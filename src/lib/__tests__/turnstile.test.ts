/**
 * Tests — spec 030 : verification Cloudflare Turnstile.
 *
 * Le cas le plus important est le fail-closed : sans secret configure, la fonction doit
 * refuser SANS appeler le reseau. C'est la decision de securite la plus facile a casser par
 * inadvertance (un repli permissif « pour que ca marche en local » desactiverait la
 * protection en production selon la configuration).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyTurnstile } from "../turnstile";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const mockFetch = vi.fn();
const originalSecret = process.env.TURNSTILE_SECRET_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = originalSecret;
});

describe("verifyTurnstile", () => {
  it("fail-closed : sans TURNSTILE_SECRET_KEY, refuse sans appel réseau", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;

    await expect(verifyTurnstile("tok", "203.0.113.1")).resolves.toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("accepte quand Cloudflare répond success: true", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret-test";
    mockFetch.mockResolvedValue({ json: async () => ({ success: true }) });

    await expect(verifyTurnstile("tok", "203.0.113.1")).resolves.toBe(true);
  });

  it("refuse quand Cloudflare répond success: false", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret-test";
    mockFetch.mockResolvedValue({ json: async () => ({ success: false }) });

    await expect(verifyTurnstile("tok", "203.0.113.1")).resolves.toBe(false);
  });

  it("transmet le secret, le jeton et l'IP à l'API siteverify", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret-test";
    mockFetch.mockResolvedValue({ json: async () => ({ success: true }) });

    await verifyTurnstile("tok-abc", "203.0.113.9");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(SITEVERIFY);
    expect(init.method).toBe("POST");

    const params = new URLSearchParams(init.body as string);
    expect(params.get("secret")).toBe("secret-test");
    expect(params.get("response")).toBe("tok-abc");
    expect(params.get("remoteip")).toBe("203.0.113.9");
  });
});
