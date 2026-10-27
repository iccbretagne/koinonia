import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...args: unknown[]) => logAudit(...args) }));

const service = await import("../church-logo");
const actor = { id: "admin-1" };

const image = (width: number, height: number, format: "png" | "jpeg" | "webp" | "gif" = "png") =>
  sharp({ create: { width, height, channels: 3, background: { r: 60, g: 20, b: 140 } } })
    [format]()
    .toBuffer();

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as { statusCode?: number; message: string };
  }
  throw new Error("aucun refus");
}

describe("church-logo service (spec 072)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.church.findUnique.mockResolvedValue({ id: "church-1" });
    prismaMock.churchLogo.findUnique.mockResolvedValue(null);
    prismaMock.churchLogo.upsert.mockResolvedValue({});
    prismaMock.churchLogo.deleteMany.mockResolvedValue({ count: 0 });
  });

  describe("refus, sans aucune écriture", () => {
    const cases: [string, () => Promise<Buffer>, RegExp][] = [
      ["SVG", async () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="20"/>'), /Format non accepté/],
      ["GIF", () => image(60, 20, "gif"), /Format non accepté/],
      ["fichier qui n'est pas une image", async () => Buffer.from("bonjour"), /pas une image/],
      ["fichier de plus de 2 Mo", async () => Buffer.alloc(2 * 1024 * 1024 + 1), /2 Mo/],
    ];
    it.each(cases)("%s", async (_label, build, message) => {
      const error = await rejection(service.setChurchLogo("church-1", "light", await build(), actor));
      expect(error.statusCode).toBe(400);
      expect(error.message).toMatch(message);
      expect(prismaMock.churchLogo.upsert).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });
  });

  it("réduit un logo très large sans le déformer, en PNG", async () => {
    const out = await service.normalizeChurchLogo(await image(3000, 500, "jpeg"));
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(600);
    expect(meta.height).toBe(100);
  });

  it("n'agrandit pas un petit logo", async () => {
    const meta = await sharp(await service.normalizeChurchLogo(await image(120, 40, "webp"))).metadata();
    expect([meta.width, meta.height]).toEqual([120, 40]);
  });

  it("dépose un logo : nouvelle version et historique de l'église", async () => {
    const version = await service.setChurchLogo("church-1", "light", await image(200, 60), actor);
    expect(version).toMatch(/^[0-9a-f]{12}$/);
    const call = prismaMock.churchLogo.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ churchId_variant: { churchId: "church-1", variant: "light" } });
    expect(call.create).toMatchObject({ churchId: "church-1", variant: "light", version, updatedById: "admin-1" });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        churchId: "church-1",
        entityType: "Church",
        entityId: "church-1",
        details: expect.objectContaining({ logo: "Logo pour fond clair déposé" }),
      })
    );
  });

  it("remplace un logo existant", async () => {
    prismaMock.churchLogo.findUnique.mockResolvedValue({ version: "old" });
    await service.setChurchLogo("church-1", "dark", await image(200, 60), actor);
    expect(logAudit.mock.calls[0][0].details.logo).toBe("Logo pour fond sombre remplacé");
  });

  it("404 pour une église inconnue", async () => {
    prismaMock.church.findUnique.mockResolvedValue(null);
    const error = await rejection(service.setChurchLogo("x", "light", await image(200, 60), actor));
    expect(error.statusCode).toBe(404);
    expect(prismaMock.churchLogo.upsert).not.toHaveBeenCalled();
  });

  it("retire un logo et le journalise ; sans logo, rien", async () => {
    await service.removeChurchLogo("church-1", "light", actor);
    expect(logAudit).not.toHaveBeenCalled();
    prismaMock.churchLogo.deleteMany.mockResolvedValue({ count: 1 });
    await service.removeChurchLogo("church-1", "light", actor);
    expect(prismaMock.churchLogo.deleteMany).toHaveBeenCalledWith({ where: { churchId: "church-1", variant: "light" } });
    expect(logAudit.mock.calls[0][0].details.logo).toBe("Logo pour fond clair retiré");
  });

  it("lit les octets d'un logo, null sans logo", async () => {
    expect(await service.getChurchLogo("church-1", "light")).toBeNull();
    prismaMock.churchLogo.findUnique.mockResolvedValue({ data: new Uint8Array([1, 2, 3]) });
    expect(await service.getChurchLogo("church-1", "light")).toEqual(Buffer.from([1, 2, 3]));
  });
});
