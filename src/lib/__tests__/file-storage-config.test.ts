/** S3 des fichiers : les deux nommages des clés sont reconnus (sinon repli silencieux sur le disque). */
import { describe, it, expect, vi, afterEach } from "vitest";

const load = async (env: Record<string, string>) => {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return (await import("../file-storage")).S3_CONFIGURED;
};

afterEach(() => vi.unstubAllEnvs());

describe("S3_CONFIGURED", () => {
  it("accepte ACCESS_KEY/SECRET_KEY et ACCESS_KEY_ID/SECRET_ACCESS_KEY, refuse une configuration incomplète", async () => {
    expect(await load({ ACCOUNTING_S3_BUCKET: "b", ACCOUNTING_S3_ACCESS_KEY: "a", ACCOUNTING_S3_SECRET_KEY: "s" })).toBe(true);
    vi.unstubAllEnvs();
    expect(await load({ ACCOUNTING_S3_BUCKET: "b", ACCOUNTING_S3_ACCESS_KEY_ID: "a", ACCOUNTING_S3_SECRET_ACCESS_KEY: "s" })).toBe(true);
    vi.unstubAllEnvs();
    expect(await load({ ACCOUNTING_S3_BUCKET: "b", ACCOUNTING_S3_ACCESS_KEY_ID: "a" })).toBe(false);
  });
});
