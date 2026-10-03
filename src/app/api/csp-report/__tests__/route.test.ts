import { describe, it, expect, vi, beforeEach } from "vitest";

const warn = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { warn: (...a: unknown[]) => warn(...a) } }));

const { POST } = await import("../route");

const post = (body: string, ip = "10.0.0.1") =>
  POST(new Request("http://localhost/api/csp-report", { method: "POST", body, headers: { "x-forwarded-for": ip } }));

describe("POST /api/csp-report", () => {
  beforeEach(() => warn.mockClear());

  it("journalise une violation (format report-uri) sans la query des URL", async () => {
    const res = await post(JSON.stringify({
      "csp-report": {
        "effective-directive": "script-src-elem",
        "blocked-uri": "https://evil.example/x.js?token=secret",
        "document-uri": "https://app.example/media/share?token=abc",
      },
    }));

    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledWith(
      { csp: { directive: "script-src-elem", blocked: "https://evil.example/x.js", document: "https://app.example/media/share", source: undefined } },
      "csp: violation"
    );
  });

  it("accepte le format Reporting API et ignore les autres types de rapport", async () => {
    await post(JSON.stringify([
      { type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "https://cdn.example/a.png" } },
      { type: "deprecation", body: {} },
    ]), "10.0.0.2");

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("répond 204 à un corps illisible et 413 à un corps trop volumineux", async () => {
    expect((await post("{pas du json", "10.0.0.3")).status).toBe(204);
    expect((await post("x".repeat(20_000), "10.0.0.4")).status).toBe(413);
  });

  it("borne le débit par IP", async () => {
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await post("{}", "10.0.0.5")).status;
    expect(last).toBe(429);
  });
});
