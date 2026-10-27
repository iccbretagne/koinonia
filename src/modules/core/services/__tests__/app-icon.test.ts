import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...args: unknown[]) => logAudit(...args) }));

const service = await import("../app-icon");
const actor = { id: "super-1" };

const square = (size: number, format: "png" | "jpeg" | "webp" | "gif" = "png", height = size) =>
  sharp({ create: { width: size, height, channels: 3, background: { r: 60, g: 20, b: 140 } } })
    [format]()
    .toBuffer();

const transparentBadge = () =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><circle cx="64" cy="64" r="40" fill="#000"/></svg>`
    )
  )
    .png()
    .toBuffer();

function emptyState() {
  prismaMock.appIconVariant.findMany.mockResolvedValue([]);
  prismaMock.auditLog.findMany.mockResolvedValue([]);
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as { statusCode?: number; message: string };
  }
  throw new Error("aucun refus");
}

describe("app-icon service (spec 069)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.resetAppIconVersionCache();
    emptyState();
    prismaMock.appIconVariant.findUnique.mockResolvedValue(null);
    prismaMock.appIconVariant.upsert.mockResolvedValue({});
    prismaMock.appIconVariant.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.appIconVariant.deleteMany.mockResolvedValue({ count: 0 });
  });

  describe("refus, sans aucune écriture", () => {
    const cases: [string, () => Promise<Buffer>, RegExp][] = [
      ["SVG", async () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"/>'), /Format non accepté/],
      ["GIF", () => square(600, "gif"), /Format non accepté/],
      ["image non carrée", () => square(800, "png", 600), /carrée/],
      ["image trop petite", () => square(256), /trop petite/],
      ["fichier qui n'est pas une image", async () => Buffer.from("bonjour"), /pas une image/],
      ["fichier de plus de 5 Mo", async () => Buffer.alloc(5 * 1024 * 1024 + 1), /5 Mo/],
    ];
    it.each(cases)("%s", async (_label, build, message) => {
      const error = await rejection(service.setAppIcon(await build(), "#3c148c", actor));
      expect(error.statusCode).toBe(400);
      expect(error.message).toMatch(message);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });

    it("JPEG et WebP acceptés au contrôle", async () => {
      await expect(service.normalizeAppIcon(await square(512, "jpeg"))).resolves.toBeInstanceOf(Buffer);
      await expect(service.normalizeAppIcon(await square(512, "webp"))).resolves.toBeInstanceOf(Buffer);
    });

    it("silhouette sans transparence refusée", async () => {
      const error = await rejection(service.setAppIconBadge(await square(128), actor));
      expect(error.statusCode).toBe(400);
      expect(error.message).toMatch(/transparent/);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  it("setAppIcon : cinq variantes remplacées en transaction, version partagée par le badge, journal CREATE", async () => {
    await service.setAppIcon(await square(600), "#3c148c", actor);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    const upserts = prismaMock.appIconVariant.upsert.mock.calls.map(([arg]) => arg);
    expect(upserts.map((u) => u.where.variant)).toEqual([
      "icon-192",
      "icon-512",
      "icon-maskable-512",
      "apple-touch-180",
      "favicon-48",
    ]);
    const versions = new Set(upserts.map((u) => u.update.version));
    expect(versions.size).toBe(1);
    expect(upserts[0].update.background).toBe("#3c148c");
    expect(prismaMock.appIconVariant.updateMany).toHaveBeenCalledWith({
      where: { variant: "badge-96" },
      data: { version: [...versions][0] },
    });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATE", entityType: "AppIcon", entityId: "app", userId: "super-1" })
    );
    expect(logAudit.mock.calls[0][0].churchId).toBeUndefined();
  });

  it("setAppIcon : remplacement journalisé UPDATE", async () => {
    prismaMock.appIconVariant.findUnique.mockResolvedValue({ version: "ancienne" });
    await service.setAppIcon(await square(600), "#3c148c", actor);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE" }));
  });

  it("setAppIconBadge : exige une icône déposée", async () => {
    const error = await rejection(service.setAppIconBadge(await transparentBadge(), actor));
    expect(error.statusCode).toBe(400);
    expect(prismaMock.appIconVariant.upsert).not.toHaveBeenCalled();
  });

  it("setAppIconBadge : enregistre la silhouette et change la version du jeu", async () => {
    prismaMock.appIconVariant.findUnique.mockImplementation(async ({ where }: { where: { variant: string } }) =>
      where.variant === "icon-192" ? { background: "#3c148c" } : null
    );
    await service.setAppIconBadge(await transparentBadge(), actor);
    const upsert = prismaMock.appIconVariant.upsert.mock.calls[0][0];
    expect(upsert.where.variant).toBe("badge-96");
    expect(prismaMock.appIconVariant.updateMany).toHaveBeenCalledWith({
      where: { variant: { not: "badge-96" } },
      data: { version: upsert.update.version },
    });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATE", details: { target: "badge" } }));
  });

  it('removeAppIcon("icon") : tout est retiré, journal DELETE', async () => {
    prismaMock.appIconVariant.deleteMany.mockResolvedValue({ count: 6 });
    await service.removeAppIcon("icon", actor);
    expect(prismaMock.appIconVariant.deleteMany).toHaveBeenCalledWith({});
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "DELETE", details: { target: "icon" } }));
  });

  it('removeAppIcon("badge") : seule la silhouette est retirée, nouvelle version', async () => {
    prismaMock.appIconVariant.deleteMany.mockResolvedValue({ count: 1 });
    await service.removeAppIcon("badge", actor);
    expect(prismaMock.appIconVariant.deleteMany).toHaveBeenCalledWith({ where: { variant: "badge-96" } });
    expect(prismaMock.appIconVariant.updateMany).toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ details: { target: "badge" } }));
  });

  it("removeAppIcon sans rien à retirer : aucun journal", async () => {
    await service.removeAppIcon("badge", actor);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("defaultAppIconPath : cloche sous une icône déposée sans silhouette", () => {
    expect(service.defaultAppIconPath("badge-96", true)).toBe("/brand/badge-bell-96.png");
    expect(service.defaultAppIconPath("badge-96", false)).toBe("/brand/koinonia-badge-96.png");
    expect(service.defaultAppIconPath("icon-192", true)).toBe("/brand/koinonia-icon-192.png");
  });

  it("getAppIconVersion : mise en cache, invalidée par une écriture", async () => {
    prismaMock.appIconVariant.findUnique.mockResolvedValue({ version: "v1" });
    expect(await service.getAppIconVersion()).toBe("v1");
    prismaMock.appIconVariant.findUnique.mockResolvedValue({ version: "v2" });
    expect(await service.getAppIconVersion()).toBe("v1");

    prismaMock.appIconVariant.deleteMany.mockResolvedValue({ count: 0 });
    await service.removeAppIcon("badge", actor);
    expect(await service.getAppIconVersion()).toBe("v2");
  });

  it("getAppIconVersion : « default » sans icône ou base indisponible", async () => {
    expect(await service.getAppIconVersion()).toBe("default");
    service.resetAppIconVersionCache();
    prismaMock.appIconVariant.findUnique.mockRejectedValue(new Error("db down"));
    expect(await service.getAppIconVersion()).toBe("default");
  });

  it("getAppIconState : icône déposée, silhouette, historique", async () => {
    const updatedAt = new Date("2026-10-27T10:00:00Z");
    const by = { name: "Marie", displayName: null, email: "m@x.fr" };
    prismaMock.appIconVariant.findMany.mockResolvedValue([
      { variant: "icon-192", version: "abc", background: "#3c148c", updatedAt, updatedBy: by },
      { variant: "badge-96", version: "abc", background: null, updatedAt, updatedBy: by },
    ]);
    prismaMock.auditLog.findMany.mockResolvedValue([
      { id: "a1", action: "CREATE", details: { target: "icon" }, createdAt: updatedAt, user: by },
    ]);
    const state = await service.getAppIconState();
    expect(state).toMatchObject({ custom: true, version: "abc", background: "#3c148c", hasBadge: true, updatedBy: "Marie" });
    expect(state.history).toEqual([
      { id: "a1", action: "CREATE", target: "icon", author: "Marie", createdAt: updatedAt.toISOString() },
    ]);
    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { entityType: "AppIcon" }, take: 20 })
    );
  });

  it("previewAppIcon : couleur proposée et aperçus, sans écriture", async () => {
    const preview = await service.previewAppIcon({ icon: await square(600) });
    expect(preview.background).toBe("#3c148c");
    expect(preview.variants["icon-192"]).toMatch(/^data:image\/png;base64,/);
    expect(preview.badge).toBeNull();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
