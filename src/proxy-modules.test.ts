// Spec 038 — comportement du proxy sur module désactivé/actif. Fichier séparé de
// `proxy.test.ts` (garde-fou cookie de session, non lié à cette feature).
//
// `src/lib/module-routes.ts` construit sa table de routes UNE FOIS à l'import (singleton
// filtré par `process.env.ENABLED_MODULES` au moment de ce premier import) — comme le
// ferait un vrai process qui ne relit pas la variable en cours de route. Chaque test qui a
// besoin d'un jeu de modules différent réinitialise les modules et réimporte `./proxy`
// après avoir positionné la variable, pour obtenir une table fraîche.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

function req(path: string, init?: { method?: string; withSession?: boolean }) {
  const url = `http://localhost${path}`;
  const headers = new Headers();
  if (init?.withSession) {
    headers.set("cookie", "authjs.session-token=fake-session-token");
  }
  return new NextRequest(url, { method: init?.method ?? "GET", headers });
}

async function loadProxy(enabledModules?: string) {
  if (enabledModules === undefined) delete process.env.ENABLED_MODULES;
  else process.env.ENABLED_MODULES = enabledModules;
  vi.resetModules();
  return import("./proxy");
}

describe("proxy — contrôle de module (spec 038)", () => {
  const originalEnabledModules = process.env.ENABLED_MODULES;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnabledModules === undefined) delete process.env.ENABLED_MODULES;
    else process.env.ENABLED_MODULES = originalEnabledModules;
  });

  it("laisse passer une API d'un module actif, avec session (tous modules actifs)", async () => {
    const { proxy } = await loadProxy(undefined);
    const res = proxy(req("/api/audio/services", { withSession: true }));
    expect(res.status).toBe(200);
  });

  it("répond 404 JSON sur l'API d'un module désactivé, y compris avec session (Super Admin y compris)", async () => {
    const { proxy } = await loadProxy("core,planning");
    const res = proxy(req("/api/audio/services", { withSession: true }));
    expect(res.status).toBe(404);
  });

  it("réécrit vers /module-absent une page d'un module désactivé", async () => {
    const { proxy } = await loadProxy("core,planning");
    const res = proxy(req("/audio", { withSession: true }));
    // NextResponse.rewrite pose x-middleware-rewrite avec l'URL cible.
    const rewriteTarget = res.headers.get("x-middleware-rewrite");
    expect(rewriteTarget).not.toBeNull();
    expect(rewriteTarget).toContain("/module-absent");
  });

  it("un lien public par jeton d'un module désactivé répond 404 avant toute vérification de jeton", async () => {
    const { proxy } = await loadProxy("core,planning");
    // Pas de session : sur un module actif ce chemin passerait (routes.public), ici il
    // doit être bloqué en amont par le contrôle de module.
    const res = proxy(req("/api/audio/public/some-token/play"));
    expect(res.status).toBe(404);
  });

  it("laisse passer un lien public par jeton d'un module actif, sans session (comportement préservé)", async () => {
    const { proxy } = await loadProxy(undefined);
    const res = proxy(req("/api/media/gallery/some-token"));
    expect(res.status).toBe(200);
  });

  it("un GET non authentifié sur une route intégration publique en écriture (POST) reste protégé", async () => {
    const { proxy } = await loadProxy(undefined);
    // /api/integration/requests n'est public qu'en POST — un GET doit rester 401.
    const res = proxy(req("/api/integration/requests", { method: "GET" }));
    expect(res.status).toBe(401);
  });

  it("un POST non authentifié sur /api/integration/requests passe (formulaire public, comportement préservé)", async () => {
    const { proxy } = await loadProxy(undefined);
    const res = proxy(req("/api/integration/requests", { method: "POST" }));
    expect(res.status).toBe(200);
  });

  it("les routes du noyau restent servies quelle que soit la liste de modules actifs", async () => {
    const { proxy } = await loadProxy("core");
    const res = proxy(req("/api/health"));
    expect(res.status).not.toBe(404);
  });

  it("le cron reste joignable sans session même avec une liste de modules réduite", async () => {
    const { proxy } = await loadProxy("core");
    const res = proxy(req("/api/cron"));
    expect(res.status).toBe(200);
  });

  it("redirige vers / un utilisateur non authentifié sur une page protégée d'un module actif (comportement préservé)", async () => {
    const { proxy } = await loadProxy(undefined);
    const res = proxy(req("/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/");
  });

  it("ne redirige pas la page de connexion elle-même quand elle est visitée sans session", async () => {
    const { proxy } = await loadProxy(undefined);
    const res = proxy(req("/"));
    expect(res.status).toBe(200);
  });

  it("l'authentification NextAuth reste joignable sans session (matcher élargi)", async () => {
    const { proxy } = await loadProxy(undefined);
    const res = proxy(req("/api/auth/session"));
    expect(res.status).toBe(200);
  });
});
