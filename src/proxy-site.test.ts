// Spec 084 / ADR-0031 — routage par hôte des sites d'événement : liste blanche, réécriture, CSP, isolation.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { resetSiteHostsCache } from "@/lib/site-host";

const SITE = "fete.evenements.example.org";
const APP = "koinonia.example.org";

function req(host: string, path: string, init: { method?: string; cookie?: string } = {}) {
  const headers = new Headers({ host });
  if (init.cookie) headers.set("cookie", init.cookie);
  return new NextRequest(`http://${host}${path}`, { method: init.method ?? "GET", headers });
}

beforeEach(() => {
  process.env.SITE_BASE_DOMAIN = "evenements.example.org";
});
afterEach(() => {
  delete process.env.SITE_BASE_DOMAIN;
  delete process.env.CSP_ENFORCE;
});

describe("proxy — hôte de site : tout ce qui n'est pas listé répond 404", () => {
  it.each([
    "/admin/users",
    "/api/users",
    "/api/auth/session",
    "/api/auth/signin",
    "/billetterie/abc",
    "/site/autre",
    "/a/b",
    "/api/ticketing/events/x",
    "/api/csp-report",
    "/manifest.json",
    "/admin/members/a.b",
  ])("%s ⇒ 404", (path) => {
    const res = proxy(req(SITE, path, { cookie: "authjs.session-token=fake" }));
    expect(res.status).toBe(404);
  });

  // Un seul segment ressemble à une page du site : réécrit sous /site/<slug>/…, jamais vers la route de
  // l'application. La page répond 404 (`notFound()`) quand le site n'a pas cette page.
  it.each(["/admin", "/billetterie", "/accueil", "/site", "/api"])("%s n'atteint jamais la route de l'application", (path) => {
    const res = proxy(req(SITE, path, { cookie: "authjs.session-token=fake" }));
    const target = res.headers.get("x-middleware-rewrite");
    expect(target).toBe(`http://${SITE}/site/fete${path}`);
  });

  it("une API non listée répond 404 JSON", async () => {
    const res = proxy(req(SITE, "/api/users"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});

describe("proxy — hôte de site : pages et chemins autorisés", () => {
  it("/ et /<page> sont réécrits vers /site/<slug>/…", () => {
    expect(proxy(req(SITE, "/")).headers.get("x-middleware-rewrite")).toBe(`http://${SITE}/site/fete`);
    expect(proxy(req(SITE, "/dress-code")).headers.get("x-middleware-rewrite")).toBe(`http://${SITE}/site/fete/dress-code`);
  });

  it.each(["/inscription/icc/fete", "/reservation/tok", "/billet/tok", "/api/ticketing/public/icc/fete/poster", "/_next/foo/bar"])("%s passe", (path) => {
    const res = proxy(req(SITE, path));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("aucune session n'est lue ni transmise : le cookie est retiré de la requête relayée", () => {
    const res = proxy(req(SITE, "/inscription/icc/fete", { cookie: "authjs.session-token=fake" }));
    const overridden = res.headers.get("x-middleware-override-headers") ?? "";
    expect(overridden).not.toContain("cookie");
    expect(res.headers.get("x-middleware-request-cookie")).toBeNull();
  });

  it("pose la CSP propre aux sites, sans origine externe", () => {
    const policy = proxy(req(SITE, "/")).headers.get("content-security-policy-report-only")!;
    expect(policy).toContain("img-src 'self' data:");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(policy).not.toMatch(/https:\/\//);
  });

  it("Turnstile n'est autorisé que sous /inscription", () => {
    const home = proxy(req(SITE, "/")).headers.get("content-security-policy-report-only")!;
    const booking = proxy(req(SITE, "/inscription/icc/fete")).headers.get("content-security-policy-report-only")!;
    expect(home).not.toContain("challenges.cloudflare.com");
    expect(booking).toContain("script-src 'self'");
    expect(booking).toContain("challenges.cloudflare.com");
  });

  it("un hôte réservé (www) sous le domaine des sites n'est pas un site", () => {
    const res = proxy(req("www.evenements.example.org", "/accueil"));
    expect(res.status).not.toBe(404); // comportement de l'application : redirection vers la connexion
    expect(res.headers.get("location")).toContain("/");
  });
});

describe("proxy — hôte de l'application", () => {
  it("/site/… tapé directement ⇒ 404", () => {
    expect(proxy(req(APP, "/site/fete", { cookie: "authjs.session-token=fake" })).status).toBe(404);
    expect(proxy(req(APP, "/site/fete/dress-code")).status).toBe(404);
    expect(proxy(req(APP, "/site")).status).toBe(404);
  });

  it("garde son comportement : pas de session ⇒ redirection, session ⇒ passe, CSP de l'application", () => {
    expect(proxy(req(APP, "/accueil")).status).toBe(307);
    const ok = proxy(req(APP, "/accueil", { cookie: "authjs.session-token=fake" }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-security-policy-report-only")).toContain("accounts.google.com");
  });

  it("un hôte inconnu sous un autre domaine suit le comportement de l'application", () => {
    expect(proxy(req("autre.exemple.fr", "/accueil")).status).toBe(307);
  });

  it("les fichiers statiques passent sans contrôle de session", () => {
    expect(proxy(req(APP, "/brand/logo.png")).status).toBe(200);
  });

  it("sans SITE_BASE_DOMAIN, aucun hôte n'est un site", () => {
    delete process.env.SITE_BASE_DOMAIN;
    expect(proxy(req(SITE, "/accueil")).status).toBe(307);
  });
});

describe("proxy — domaine dédié (cache des domaines approuvés)", () => {
  const FOREIGN = "fete.exemple.org";
  beforeEach(() => {
    process.env.TRAEFIK_PROVIDER_TOKEN = "t";
    process.env.APP_URL = `https://${APP}`;
    resetSiteHostsCache(null);
    // Pas de rechargement réseau pendant le test
    (globalThis as { fetch: typeof fetch }).fetch = (async () => new Response("{}", { status: 500 })) as typeof fetch;
  });
  afterEach(() => {
    delete process.env.TRAEFIK_PROVIDER_TOKEN;
    delete process.env.APP_URL;
    resetSiteHostsCache(null);
  });

  it("domaine non approuvé (cache vide ou absent) ⇒ 404, jamais l'application", () => {
    for (const path of ["/", "/billetterie", "/api/users", "/accueil"]) expect(proxy(req(FOREIGN, path)).status).toBe(404);
    resetSiteHostsCache({ "autre.exemple.org": "nuit" });
    expect(proxy(req(FOREIGN, "/")).status).toBe(404);
  });

  it("domaine approuvé ⇒ site réécrit, liste blanche appliquée", () => {
    resetSiteHostsCache({ [FOREIGN]: "nuit" });
    expect(proxy(req(FOREIGN, "/")).headers.get("x-middleware-rewrite")).toBe(`http://${FOREIGN}/site/nuit`);
    expect(proxy(req(FOREIGN, "/api/users")).status).toBe(404);
    expect(proxy(req(FOREIGN, "/admin/users")).status).toBe(404);
  });

  it("l'hôte de l'application et la boucle locale ne sont pas concernés", () => {
    expect(proxy(req(APP, "/dashboard")).status).not.toBe(404);
    expect(proxy(req("127.0.0.1:3001", "/api/internal/site-hosts")).status).toBe(200);
  });

  it("sans jeton configuré, comportement inchangé pour les hôtes étrangers", () => {
    delete process.env.TRAEFIK_PROVIDER_TOKEN;
    expect(proxy(req(FOREIGN, "/dashboard")).status).not.toBe(404);
  });
});
