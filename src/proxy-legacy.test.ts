// Spec 092, lot 4 — redirections des anciennes adresses d'écran par le proxy.
import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

const SESSION = "authjs.session-token=fake-session-token";

function req(path: string, init?: { method?: string; host?: string; session?: boolean }) {
  const host = init?.host ?? "localhost";
  const headers = new Headers({ host });
  if (init?.session !== false) headers.set("cookie", SESSION);
  return new NextRequest(`http://${host}${path}`, { method: init?.method ?? "GET", headers });
}

async function loadProxy(enabledModules?: string) {
  if (enabledModules === undefined) delete process.env.ENABLED_MODULES;
  else process.env.ENABLED_MODULES = enabledModules;
  vi.resetModules();
  return import("./proxy");
}

const ALL =
  "core,planning,discipleship,storage,media,audio,agenda,rooms,integration,care,accounting,jobs,giving,messages,shuttle,ticketing,treasury,assistant,serving,mcp,forms,campaigns";
const ALL_BUT = (off: string) =>
  ALL.split(",")
    .filter((m) => !off.split(",").includes(m))
    .join(",");

describe("proxy — anciennes adresses (spec 092, lot 4)", () => {
  const original = { modules: process.env.ENABLED_MODULES, base: process.env.SITE_BASE_DOMAIN };
  afterEach(() => {
    if (original.modules === undefined) delete process.env.ENABLED_MODULES;
    else process.env.ENABLED_MODULES = original.modules;
    if (original.base === undefined) delete process.env.SITE_BASE_DOMAIN;
    else process.env.SITE_BASE_DOMAIN = original.base;
  });

  it.each([
    ["/events", "/evenements"],
    ["/planning/events", "/evenements"],
    ["/accounting/requests/r1", "/finances/demandes/r1"],
    ["/admin/events/e1/report", "/evenements/comptes-rendus/e1"],
    ["/dashboard", "/planning/departements"],
    ["/admin/churches", "/plateforme/eglises"],
    ["/formulaires/mes-reponses", "/evenements/mes-inscriptions?vue=formulaires"],
  ])("GET %s → 307 vers %s, même origine, jamais mise en cache", async (from, to) => {
    const { proxy } = await loadProxy(undefined);
    const res = proxy(req(from));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`http://localhost${to}`);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("conserve la requête (et l'ajoute à une requête fixe)", async () => {
    const { proxy } = await loadProxy(undefined);
    expect(proxy(req("/dashboard?dept=d1&event=e2")).headers.get("location")).toBe("http://localhost/planning/departements?dept=d1&event=e2");
    expect(proxy(req("/formulaires/mes-reponses?x=1")).headers.get("location")).toBe(
      "http://localhost/evenements/mes-inscriptions?x=1&vue=formulaires"
    );
  });

  it("HEAD redirigé ; POST, PUT, DELETE jamais", async () => {
    const { proxy } = await loadProxy(undefined);
    expect(proxy(req("/events", { method: "HEAD" })).status).toBe(307);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = proxy(req("/events", { method }));
      expect(res.headers.get("location"), method).toBeNull();
      expect(res.status, method).not.toBe(307);
    }
  });

  it("sans session : redirigé quand même, la nouvelle adresse renvoie ensuite à la connexion", async () => {
    const { proxy } = await loadProxy(undefined);
    expect(proxy(req("/events", { session: false })).headers.get("location")).toBe("http://localhost/evenements");
    expect(proxy(req("/evenements", { session: false })).headers.get("location")).toBe("http://localhost/");
  });

  it.each([
    "//evil.com",
    "/accounting/requests/%2F%2Fevil.com",
    "/accounting/requests/a%5Cevil.com",
    "/accounting/requests/%2e%2e",
    "/accounting/requests/%0d%0aLocation:evil",
    "/events%2F..%2Fevil",
  ])("entrée hostile %s : aucune redirection vers une autre origine", async (path) => {
    const { proxy } = await loadProxy(undefined);
    const location = proxy(req(path)).headers.get("location");
    if (location) expect(new URL(location).origin).toBe("http://localhost");
    if (location) expect(location).not.toMatch(/evil/);
  });

  it.each([
    "/media/v/tok", "/media/c/tok", "/media/g/tok", "/media/d/tok", "/billet/tok", "/reservation/tok", "/collecte/tok",
    "/f/eglise/form", "/servir/eglise", "/entretien/tok", "/donner/eglise", "/inscription/eglise/evt",
    "/accueil", "/profile", "/profile/notifications", "/guide", "/messages/m1", "/mcp/autoriser", "/evenements",
  ])("jamais redirigé : %s", async (path) => {
    const { proxy } = await loadProxy(undefined);
    expect(proxy(req(path)).status).not.toBe(307);
  });

  it("les API ne sont jamais redirigées", async () => {
    const { proxy } = await loadProxy(undefined);
    const res = proxy(req("/api/events"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("hôte d'un site d'événement : aucune redirection d'ancienne adresse", async () => {
    process.env.SITE_BASE_DOMAIN = "evenements.example.org";
    const { proxy } = await loadProxy(undefined);
    const res = proxy(req("/events", { host: "fete.evenements.example.org" }));
    expect(res.status).not.toBe(307);
    expect(res.headers.get("location")).toBeNull();
  });

  it.each([
    ["shuttle", "/accounting/navette", "/finances/navette"],
    ["treasury", "/accounting/tresorerie", "/finances/tresorerie"],
    ["ticketing", "/billetterie", "/evenements/billetterie"],
    ["campaigns", "/collectes", "/demandes/questionnaires"],
  ])("module %s coupé : 404 à l'ancienne (%s) comme à la nouvelle adresse, sans redirection", async (off, from, to) => {
    const { proxy } = await loadProxy(ALL_BUT(off));
    for (const path of [from, to]) {
      const res = proxy(req(path));
      expect(res.status, path).not.toBe(307);
      expect(res.headers.get("location"), path).toBeNull();
      expect(res.headers.get("x-middleware-rewrite") ?? "", path).toContain("/module-absent");
    }
  });
});
