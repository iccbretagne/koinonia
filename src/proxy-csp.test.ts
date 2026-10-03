// ADR-0022 — CSP posée par le proxy sur les pages, jamais sur l'API.
import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

function req(path: string, withSession = true) {
  const headers = new Headers();
  if (withSession) headers.set("cookie", "authjs.session-token=fake-session-token");
  return new NextRequest(`http://localhost${path}`, { headers });
}

describe("proxy — Content-Security-Policy", () => {
  afterEach(() => {
    delete process.env.CSP_ENFORCE;
  });

  it("pose la politique en Report-Only par défaut, avec un nonce neuf à chaque requête", () => {
    const a = proxy(req("/accueil")).headers.get("content-security-policy-report-only");
    const b = proxy(req("/accueil")).headers.get("content-security-policy-report-only");

    expect(a).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(a).toContain("report-uri /api/csp-report");
    expect(a).not.toBe(b);
  });

  it("transmet la politique à Next.js dans l'en-tête de la requête (nonce de ses scripts)", () => {
    const res = proxy(req("/accueil"));
    const policy = res.headers.get("content-security-policy-report-only")!;
    expect(res.headers.get("x-middleware-request-content-security-policy-report-only")).toBe(policy);
  });

  it("devient bloquante avec CSP_ENFORCE=true", () => {
    process.env.CSP_ENFORCE = "true";
    const res = proxy(req("/accueil"));
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("content-security-policy-report-only")).toBeNull();
  });

  it("s'applique aussi aux redirections vers la connexion, jamais à l'API", () => {
    expect(proxy(req("/accueil", false)).headers.get("content-security-policy-report-only")).toBeTruthy();
    expect(proxy(req("/api/health")).headers.get("content-security-policy-report-only")).toBeNull();
  });

  it("laisse passer les rapports de violation sans session", () => {
    expect(proxy(req("/api/csp-report", false)).status).toBe(200);
  });
});
