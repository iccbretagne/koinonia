import { describe, it, expect } from "vitest";
import { buildCsp, cspHeaderName, storageOrigins } from "../csp";

describe("csp", () => {
  it("n'autorise l'exécution de scripts que par nonce, sans unsafe-inline ni unsafe-eval en production", () => {
    const policy = buildCsp({ nonce: "abc", isDev: false, storage: [] });
    const scriptSrc = policy.split("; ").find((d) => d.startsWith("script-src"));

    expect(scriptSrc).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("frame-src https://challenges.cloudflare.com");
  });

  it("ajoute 'unsafe-eval' en développement uniquement", () => {
    expect(buildCsp({ nonce: "n", isDev: true, storage: [] })).toContain("'unsafe-eval'");
  });

  it("autorise les origines S3 configurées pour les images, médias et téléversements", () => {
    const storage = storageOrigins({
      MEDIA_S3_ENDPOINT: "https://s3.fr-par.scw.cloud",
      ACCOUNTING_S3_ENDPOINT: "https://s3.fr-par.scw.cloud/",
      BACKUP_S3_ENDPOINT: "pas une url",
    });
    expect(storage).toEqual(["https://s3.fr-par.scw.cloud"]);

    const policy = buildCsp({ nonce: "n", isDev: false, storage });
    for (const directive of ["img-src", "media-src", "connect-src"]) {
      expect(policy.split("; ").find((d) => d.startsWith(directive))).toContain("https://s3.fr-par.scw.cloud");
    }
  });

  it("n'est bloquante qu'avec CSP_ENFORCE=true", () => {
    expect(cspHeaderName({})).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName({ CSP_ENFORCE: "1" })).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName({ CSP_ENFORCE: "true" })).toBe("Content-Security-Policy");
  });
});
