/**
 * Issue #505 — échappatoire manuelle « Problème de connexion ? » : supprime les
 * cookies Auth.js et renvoie sur la page de connexion, sans session requise.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";

function request(cookieHeader: string) {
  return new NextRequest("https://koinonia.test/api/auth/reset", {
    headers: { cookie: cookieHeader },
  });
}

describe("GET /api/auth/reset", () => {
  /**
   * Location relative et non absolue : derrière le reverse proxy, une URL
   * construite depuis `request.url` porte l'adresse interne du service
   * (`https://0.0.0.0:3001`), injoignable pour le navigateur. Constaté en
   * recette après le premier déploiement de #505.
   */
  it("renvoie sur la page de connexion par une Location relative", async () => {
    const res = await GET(request(""));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/");
  });

  it("expire les cookies de session et de contrôle OAuth", async () => {
    const res = await GET(
      request(
        "__Secure-authjs.session-token=abc; authjs.state=xyz; currentChurchId=church-1"
      )
    );

    const cleared = res.cookies
      .getAll()
      .filter((c) => c.maxAge === 0)
      .map((c) => c.name);
    expect(cleared).toContain("__Secure-authjs.session-token");
    expect(cleared).toContain("authjs.state");
    expect(cleared).not.toContain("currentChurchId");
  });

  it("n'est pas mise en cache par les intermédiaires", async () => {
    const res = await GET(request("authjs.session-token=abc"));

    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("fonctionne sans aucun cookie (pas d'erreur)", async () => {
    const res = await GET(request(""));

    expect(res.status).toBe(307);
  });
});
