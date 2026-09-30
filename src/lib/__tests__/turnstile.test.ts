/**
 * Tests — spec 030 : verification Cloudflare Turnstile.
 *
 * Le cas le plus important est le fail-closed : sans secret configure, la fonction doit
 * refuser SANS appeler le reseau. C'est la decision de securite la plus facile a casser par
 * inadvertance (un repli permissif « pour que ca marche en local » desactiverait la
 * protection en production selon la configuration).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getTurnstileSiteKey, verifyTurnstile } from "../turnstile";

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

  it("ignore un commentaire en fin de ligne dans la clé secrète (EnvironmentFile systemd)", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret-test           # clé secrète Turnstile";
    mockFetch.mockResolvedValue({ json: async () => ({ success: true }) });

    await verifyTurnstile("tok-abc", "203.0.113.9");

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(new URLSearchParams(init.body as string).get("secret")).toBe("secret-test");
  });
});

describe("getTurnstileSiteKey", () => {
  const LEGACY = "NEXT_PUBLIC_TURNSTILE_SITE_KEY";
  const saved = {
    site: process.env.TURNSTILE_SITE_KEY,
    legacy: process.env[LEGACY],
    secret: process.env.TURNSTILE_SECRET_KEY,
  };

  function restore(name: string, value: string | undefined) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  beforeEach(() => {
    delete process.env.TURNSTILE_SITE_KEY;
    delete process.env[LEGACY];
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  afterEach(() => {
    restore("TURNSTILE_SITE_KEY", saved.site);
    restore(LEGACY, saved.legacy);
    restore("TURNSTILE_SECRET_KEY", saved.secret);
  });

  it("retourne la clé publique quand les deux clés sont configurées", () => {
    process.env.TURNSTILE_SITE_KEY = "site-test";
    process.env.TURNSTILE_SECRET_KEY = "secret-test";
    expect(getTurnstileSiteKey()).toBe("site-test");
  });

  it("accepte encore l'ancien nom NEXT_PUBLIC_TURNSTILE_SITE_KEY, lu au runtime", () => {
    process.env[LEGACY] = "site-legacy";
    process.env.TURNSTILE_SECRET_KEY = "secret-test";
    expect(getTurnstileSiteKey()).toBe("site-legacy");
  });

  it("ignore un commentaire en fin de ligne (EnvironmentFile systemd ne le retire pas)", () => {
    process.env.TURNSTILE_SITE_KEY = "site-test           # clé publique Turnstile (affichée dans le widget)";
    process.env.TURNSTILE_SECRET_KEY = "secret-test  # clé secrète";
    expect(getTurnstileSiteKey()).toBe("site-test");
  });

  it("un commentaire seul ne vaut pas une clé", () => {
    process.env.TURNSTILE_SITE_KEY = "   # à renseigner";
    process.env.TURNSTILE_SECRET_KEY = "secret-test";
    expect(getTurnstileSiteKey()).toBeNull();
  });

  it("formulaire indisponible (null) sans clé publique", () => {
    process.env.TURNSTILE_SECRET_KEY = "secret-test";
    expect(getTurnstileSiteKey()).toBeNull();
  });

  it("formulaire indisponible (null) sans clé secrète : la soumission serait refusée de toute façon", () => {
    process.env.TURNSTILE_SITE_KEY = "site-test";
    expect(getTurnstileSiteKey()).toBeNull();
  });
});
