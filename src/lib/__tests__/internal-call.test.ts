/** Tests — appels internes (fournisseur Traefik, liste des domaines du proxy) : jeton ET boucle locale. */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { requireInternalCall } from "../internal-call";

const req = (headers: Record<string, string>) => new Request("http://127.0.0.1:3001/api/internal/traefik", { headers });
const OK = { host: "127.0.0.1:3001", authorization: "Bearer secret-token" };

beforeEach(() => {
  process.env.TRAEFIK_PROVIDER_TOKEN = "secret-token";
});
afterEach(() => {
  delete process.env.TRAEFIK_PROVIDER_TOKEN;
});

describe("requireInternalCall", () => {
  it("accepte la boucle locale avec le bon jeton", () => {
    expect(() => requireInternalCall(req(OK))).not.toThrow();
    expect(() => requireInternalCall(req({ ...OK, host: "localhost:3001" }))).not.toThrow();
  });

  it("refuse sans jeton ou avec un mauvais jeton", () => {
    expect(() => requireInternalCall(req({ host: OK.host }))).toThrow(expect.objectContaining({ statusCode: 403 }));
    expect(() => requireInternalCall(req({ ...OK, authorization: "Bearer secret-tokeX" }))).toThrow(expect.objectContaining({ statusCode: 403 }));
    expect(() => requireInternalCall(req({ ...OK, authorization: "secret-token" }))).toThrow(expect.objectContaining({ statusCode: 403 }));
  });

  it("refuse hors boucle locale, même avec le bon jeton", () => {
    expect(() => requireInternalCall(req({ ...OK, host: "koinonia.example.org" }))).toThrow(expect.objectContaining({ statusCode: 403 }));
    // Relayée par Traefik : hôte local falsifié mais en-têtes de transfert présents.
    expect(() => requireInternalCall(req({ ...OK, "x-forwarded-for": "203.0.113.9" }))).toThrow(expect.objectContaining({ statusCode: 403 }));
    expect(() => requireInternalCall(req({ ...OK, "x-forwarded-host": "koinonia.example.org" }))).toThrow(expect.objectContaining({ statusCode: 403 }));
  });

  it("404 si le jeton n'est pas configuré (fonction désactivée)", () => {
    delete process.env.TRAEFIK_PROVIDER_TOKEN;
    expect(() => requireInternalCall(req(OK))).toThrow(expect.objectContaining({ statusCode: 404 }));
  });
});
