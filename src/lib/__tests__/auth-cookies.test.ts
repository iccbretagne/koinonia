/**
 * Issue #505 — un cookie de session dont la ligne `Session` n'existe plus, ou
 * des cookies de contrôle OAuth laissés par un callback en échec, bloquent la
 * reconnexion et ne sont jamais supprimés par Auth.js. L'utilisateur devait
 * purger les données du site dans son navigateur.
 */
import { describe, it, expect, vi } from "vitest";
import { isAuthCookieName, clearAuthCookies } from "../auth-cookies";

function reader(...names: string[]) {
  return { getAll: () => names.map((name) => ({ name })) };
}

function writer() {
  return { set: vi.fn() };
}

describe("isAuthCookieName", () => {
  it("reconnaît les cookies Auth.js, préfixés ou non", () => {
    for (const name of [
      "authjs.session-token",
      "__Secure-authjs.session-token",
      "__Host-authjs.csrf-token",
      "authjs.callback-url",
      "authjs.pkce.code_verifier",
      "authjs.state",
      "authjs.nonce",
    ]) {
      expect(isAuthCookieName(name), name).toBe(true);
    }
  });

  it("ignore les cookies étrangers à Auth.js", () => {
    for (const name of ["currentChurchId", "next-auth.session-token", "authjsx", "theme"]) {
      expect(isAuthCookieName(name), name).toBe(false);
    }
  });
});

describe("clearAuthCookies", () => {
  it("expire les cookies de session et les cookies de contrôle OAuth", () => {
    const res = writer();
    const cleared = clearAuthCookies(
      reader("authjs.session-token", "authjs.state", "authjs.pkce.code_verifier"),
      res
    );

    expect(cleared).toEqual([
      "authjs.session-token",
      "authjs.state",
      "authjs.pkce.code_verifier",
    ]);
    expect(res.set).toHaveBeenCalledTimes(3);
    expect(res.set).toHaveBeenCalledWith(
      "authjs.session-token",
      "",
      expect.objectContaining({ maxAge: 0, path: "/" })
    );
  });

  it("repositionne Secure sur les cookies préfixés, sinon le navigateur ignore la suppression", () => {
    const res = writer();
    clearAuthCookies(reader("__Secure-authjs.session-token", "authjs.session-token"), res);

    expect(res.set).toHaveBeenCalledWith(
      "__Secure-authjs.session-token",
      "",
      expect.objectContaining({ secure: true })
    );
    expect(res.set).toHaveBeenCalledWith(
      "authjs.session-token",
      "",
      expect.objectContaining({ secure: false })
    );
  });

  it("ne touche pas aux cookies applicatifs", () => {
    const res = writer();
    const cleared = clearAuthCookies(reader("currentChurchId", "theme"), res);

    expect(cleared).toEqual([]);
    expect(res.set).not.toHaveBeenCalled();
  });
});
