import { describe, it, expect } from "vitest";
import { RouteTable } from "../module-routes";
import type { ModuleManifest } from "../module-registry";

const noyau = { pages: ["/", "/no-access"], api: ["/api/auth", "/api/health"] };

const admin: ModuleManifest = {
  name: "admin-mod",
  version: "1.0.0",
  routes: { authenticated: [{ path: "/admin" }] },
};

const media: ModuleManifest = {
  name: "media",
  version: "1.0.0",
  routes: {
    api: [{ path: "/api/admin/media" }],
    authenticated: [{ path: "/media" }],
    public: [{ path: "/api/media/gallery" }],
  },
};

const integration: ModuleManifest = {
  name: "integration",
  version: "1.0.0",
  routes: {
    api: [{ path: "/api/integration" }],
    public: [{ path: "/api/integration/requests", method: "POST" }],
  },
};

describe("RouteTable — résolution (spec 038)", () => {
  const table = new RouteTable([admin, media, integration], noyau);

  it("résout au préfixe le plus long : /api/admin/media appartient à media, pas à admin-mod", () => {
    expect(table.resolve("/api/admin/media")).toMatchObject({ kind: "module", owner: "media" });
    expect(table.resolve("/api/admin/media/collections")).toMatchObject({ owner: "media" });
  });

  it("un chemin exact déclaré résout au module déclarant", () => {
    expect(table.resolve("/media")).toMatchObject({ owner: "media" });
    expect(table.resolve("/media/events/42")).toMatchObject({ owner: "media" });
  });

  it("un chemin non déclaré est orphelin", () => {
    expect(table.resolve("/api/unknown")).toMatchObject({ kind: "orphan", owner: null });
  });

  it("un préfixe ne capture pas un segment voisin qui le prolonge sans frontière ('/admin' ne capture pas '/administration')", () => {
    const t = new RouteTable([admin], noyau);
    expect(t.resolve("/administration")).toMatchObject({ kind: "orphan" });
  });

  it("ignore la barre finale et la chaîne de requête", () => {
    expect(table.resolve("/media/")).toMatchObject({ owner: "media" });
    expect(table.resolve("/media?tab=events")).toMatchObject({ owner: "media" });
  });

  it("les routes du noyau résolvent avec kind 'noyau'", () => {
    expect(table.resolve("/api/auth/session")).toMatchObject({ kind: "noyau", owner: "noyau" });
    expect(table.resolve("/no-access")).toMatchObject({ kind: "noyau" });
  });

  it("isPublic ne s'applique qu'aux préfixes déclarés public", () => {
    expect(table.isPublic("/api/media/gallery/abc123", "GET")).toBe(true);
    expect(table.isPublic("/api/admin/media", "GET")).toBe(false);
  });

  it("isPublic respecte la restriction de méthode d'une entrée publique", () => {
    expect(table.isPublic("/api/integration/requests", "POST")).toBe(true);
    expect(table.isPublic("/api/integration/requests", "GET")).toBe(false);
  });

  it("un module absent de la liste passée au constructeur n'a plus de routes résolues", () => {
    const withoutMedia = new RouteTable([admin, integration], noyau);
    expect(withoutMedia.resolve("/media")).toMatchObject({ kind: "orphan" });
  });
});
