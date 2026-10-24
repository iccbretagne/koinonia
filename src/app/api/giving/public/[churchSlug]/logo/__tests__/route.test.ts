import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";

const getPublicGivingLogoStream = vi.fn();
vi.mock("@/modules/giving", () => ({
  getPublicGivingLogoStream: (...args: unknown[]) => getPublicGivingLogoStream(...args),
}));

const { GET } = await import("../route");

const call = () =>
  GET(new Request("http://localhost/api/giving/public/icc-rennes/logo?v=1"), {
    params: Promise.resolve({ churchSlug: "icc-rennes" }),
  });

describe("/api/giving/public/[churchSlug]/logo (spec 066)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("404 si la page est inactive ou sans logo", async () => {
    getPublicGivingLogoStream.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(getPublicGivingLogoStream).toHaveBeenCalledWith("icc-rennes");
  });

  it("200 en image/png, nosniff, cache immuable", async () => {
    getPublicGivingLogoStream.mockResolvedValue(Readable.from([Buffer.from("png")]));
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400, immutable");
    expect(await res.text()).toBe("png");
  });
});
