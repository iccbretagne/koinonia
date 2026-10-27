import { describe, it, expect, vi, beforeEach } from "vitest";

const getAppIconVariant = vi.fn();
const getAppIconVersion = vi.fn();
vi.mock("@/modules/core", async () => {
  const schemas = await import("@/modules/core/schemas");
  return {
    getAppIconVariant: (...args: unknown[]) => getAppIconVariant(...args),
    getAppIconVersion: () => getAppIconVersion(),
    defaultAppIconPath: (variant: keyof typeof schemas.DEFAULT_APP_ICON_PATHS, custom: boolean) =>
      variant === "badge-96" && custom ? schemas.GENERIC_BADGE_PATH : schemas.DEFAULT_APP_ICON_PATHS[variant],
  };
});

const { GET } = await import("../route");

const call = (variant: string, query = "") =>
  GET(new Request(`http://localhost/api/app-icon/${variant}${query}`), { params: Promise.resolve({ variant }) });

describe("/api/app-icon/[variant] (spec 069)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAppIconVariant.mockResolvedValue(null);
    getAppIconVersion.mockResolvedValue("default");
  });

  it("404 pour une variante inconnue", async () => {
    expect((await call("../../etc/passwd")).status).toBe(404);
    expect((await call("icon-1024.png")).status).toBe(404);
    expect(getAppIconVariant).not.toHaveBeenCalled();
  });

  it("sans icône déposée : 302 vers l'icône livrée", async () => {
    const res = await call("icon-192.png");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost/brand/koinonia-icon-192.png");
    expect(getAppIconVariant).toHaveBeenCalledWith("icon-192");
  });

  it("badge sans icône déposée : le « K » livré", async () => {
    const res = await call("badge-96.png");
    expect(res.headers.get("location")).toBe("http://localhost/brand/koinonia-badge-96.png");
  });

  it("badge absent sous une icône déposée : la cloche générique", async () => {
    getAppIconVersion.mockResolvedValue("abc");
    const res = await call("badge-96.png");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost/brand/badge-bell-96.png");
  });

  it("icône déposée : PNG, cache immuable quand la version correspond", async () => {
    getAppIconVariant.mockResolvedValue({ data: new Uint8Array([1, 2, 3]), version: "abc" });
    const res = await call("favicon-48.png", "?v=abc");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("icône déposée, version périmée ou absente : cache court", async () => {
    getAppIconVariant.mockResolvedValue({ data: new Uint8Array([1]), version: "abc" });
    expect((await call("icon-512", "?v=old")).headers.get("cache-control")).toBe("public, max-age=300");
    expect((await call("icon-512")).headers.get("cache-control")).toBe("public, max-age=300");
  });
});
