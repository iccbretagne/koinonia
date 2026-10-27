import { describe, it, expect, vi } from "vitest";

const getAppIconVersion = vi.fn();
vi.mock("@/modules/core", () => ({
  getAppIconVersion: () => getAppIconVersion(),
  appIconUrl: (variant: string, version: string) => `/api/app-icon/${variant}.png?v=${version}`,
}));

const { GET } = await import("../route");

describe("/api/app-icon/manifest (spec 069)", () => {
  it("icônes versionnées, type manifest", async () => {
    getAppIconVersion.mockResolvedValue("abc");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/manifest+json");
    const manifest = await res.json();
    expect(manifest.start_url).toBe("/accueil");
    expect(manifest.icons.map((i: { src: string }) => i.src)).toEqual([
      "/api/app-icon/icon-192.png?v=abc",
      "/api/app-icon/icon-512.png?v=abc",
      "/api/app-icon/icon-maskable-512.png?v=abc",
    ]);
    expect(manifest.icons[2].purpose).toBe("maskable");
  });
});
