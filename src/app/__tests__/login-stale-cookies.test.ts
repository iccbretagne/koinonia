/**
 * Issue #505 — la page de connexion doit renvoyer vers la route de
 * réinitialisation quand des cookies Auth.js subsistent sans session valide,
 * pour que l'utilisateur n'ait pas à purger son navigateur lui-même.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({ redirect }));

function mockPage(opts: {
  session: { user: { churchRoles: unknown[] } } | null;
  cookieNames: string[];
}) {
  vi.doMock("next/headers", () => ({
    cookies: vi.fn().mockResolvedValue({
      getAll: () => opts.cookieNames.map((name) => ({ name })),
    }),
  }));
  vi.doMock("@/lib/auth", () => ({
    auth: vi.fn().mockResolvedValue(opts.session),
    signIn: vi.fn(),
    getCurrentChurchId: vi.fn().mockResolvedValue("church-1"),
    isDevLoginEnabled: () => false,
  }));
}

describe("Page de connexion — cookies Auth.js périmés", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("renvoie vers /api/auth/reset quand un cookie de session survit sans session", async () => {
    mockPage({ session: null, cookieNames: ["__Secure-authjs.session-token"] });
    const LoginPage = (await import("../page")).default;

    await expect(LoginPage()).rejects.toThrow("REDIRECT:/api/auth/reset");
  });

  it("renvoie vers /api/auth/reset quand des cookies de contrôle OAuth subsistent", async () => {
    mockPage({ session: null, cookieNames: ["authjs.pkce.code_verifier", "authjs.state"] });
    const LoginPage = (await import("../page")).default;

    await expect(LoginPage()).rejects.toThrow("REDIRECT:/api/auth/reset");
  });

  it("affiche la page de connexion quand il n'y a aucun cookie Auth.js", async () => {
    mockPage({ session: null, cookieNames: ["currentChurchId"] });
    const LoginPage = (await import("../page")).default;

    await expect(LoginPage()).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("ne nettoie jamais les cookies d'une session valide", async () => {
    mockPage({
      session: { user: { churchRoles: [] } },
      cookieNames: ["__Secure-authjs.session-token"],
    });
    const LoginPage = (await import("../page")).default;

    await expect(LoginPage()).rejects.toThrow("REDIRECT:/profile");
    expect(redirect).not.toHaveBeenCalledWith("/api/auth/reset");
  });
});
