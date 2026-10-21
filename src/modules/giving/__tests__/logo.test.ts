import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...args: unknown[]) => logAudit(...args) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
const alertPaymentDetailsChange = vi.fn();
vi.mock("../services/alerts", () => ({
  alertPaymentDetailsChange: (...args: unknown[]) => alertPaymentDetailsChange(...args),
}));
const uploadFile = vi.fn();
const deleteMediaFile = vi.fn();
const getS3ObjectStream = vi.fn();
vi.mock("@/modules/storage", () => ({
  uploadFile: (...args: unknown[]) => uploadFile(...args),
  deleteMediaFile: (...args: unknown[]) => deleteMediaFile(...args),
  getS3ObjectStream: (...args: unknown[]) => getS3ObjectStream(...args),
}));

const { normalizeLogo, setGivingLogo, getPublicGivingLogoStream } = await import("../services/logo");

const actor = { id: "user-1", name: "Marie" };
const OLD_KEY = "giving/church-1/logo-11111111-1111-4111-8111-111111111111.png";

/** Image réelle, avec des métadonnées EXIF à retirer. */
async function image(format: "png" | "jpeg" | "webp", width = 400, height = 100) {
  return sharp({ create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0.5 } } })
    .withMetadata({ exif: { IFD0: { Copyright: "secret" } } })
    [format]()
    .toBuffer();
}

function churchWith(logoKey: string | null) {
  return {
    id: "church-1",
    name: "ICC Rennes",
    accountingEmails: "compta@icc.fr",
    givingPage: logoKey === undefined ? null : { logoKey },
  };
}

describe("normalizeLogo (spec 066)", () => {
  it.each(["png", "jpeg", "webp"] as const)("réencode un %s en PNG sans métadonnées", async (format) => {
    const out = await normalizeLogo(await image(format));
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("png");
    expect(meta.exif).toBeUndefined();
  });

  it("borne les dimensions à 1200 × 600 en gardant les proportions", async () => {
    const meta = await sharp(await normalizeLogo(await image("png", 4000, 1000))).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(300);
  });

  it("refuse un SVG, un texte renommé et une image tronquée", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    await expect(normalizeLogo(svg)).rejects.toMatchObject({ statusCode: 400 });
    await expect(normalizeLogo(Buffer.from("pas une image"))).rejects.toMatchObject({ statusCode: 400 });
    const png = await image("png");
    await expect(normalizeLogo(png.subarray(0, png.length / 2))).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuse un fichier de plus de 2 Mo", async () => {
    await expect(normalizeLogo(Buffer.alloc(2 * 1024 * 1024 + 1))).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("setGivingLogo (spec 066)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadFile.mockResolvedValue(undefined);
    deleteMediaFile.mockResolvedValue(undefined);
    prismaMock.givingPage.upsert.mockResolvedValue({ id: "gp-1" });
  });

  it("dépôt : nouvelle clé, journal et alerte « déposé »", async () => {
    prismaMock.church.findUnique.mockResolvedValue(churchWith(null));
    const version = await setGivingLogo("church-1", await image("png"), actor);
    const key = uploadFile.mock.calls[0][0] as string;
    expect(key).toMatch(/^giving\/church-1\/logo-[0-9a-f-]{36}\.png$/);
    expect(key).toContain(version!);
    expect(uploadFile.mock.calls[0][2]).toBe("image/png");
    expect(prismaMock.givingPage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { logoKey: key, updatedById: "user-1" } })
    );
    expect(deleteMediaFile).not.toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "GivingPage", details: expect.objectContaining({ changedFields: ["logoKey"] }) })
    );
    expect(alertPaymentDetailsChange.mock.calls[0][1]).toEqual([{ label: "Logo", before: "aucun", after: "déposé" }]);
  });

  it("remplacement : l'ancienne clé est supprimée après l'enregistrement", async () => {
    prismaMock.church.findUnique.mockResolvedValue(churchWith(OLD_KEY));
    await setGivingLogo("church-1", await image("png"), actor);
    expect(uploadFile.mock.calls[0][0]).not.toBe(OLD_KEY);
    expect(deleteMediaFile).toHaveBeenCalledWith(OLD_KEY);
    expect(alertPaymentDetailsChange.mock.calls[0][1][0].after).toBe("remplacé");
  });

  it("retrait : clé effacée, aucun dépôt, alerte « retiré »", async () => {
    prismaMock.church.findUnique.mockResolvedValue(churchWith(OLD_KEY));
    expect(await setGivingLogo("church-1", null, actor)).toBeNull();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(deleteMediaFile).toHaveBeenCalledWith(OLD_KEY);
    expect(alertPaymentDetailsChange.mock.calls[0][1][0].after).toBe("retiré");
  });

  it("page jamais configurée : créée inactive avec le logo", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ ...churchWith(null), givingPage: null });
    await setGivingLogo("church-1", await image("png"), actor);
    const call = prismaMock.givingPage.upsert.mock.calls[0][0];
    expect(call.create).toMatchObject({ churchId: "church-1", enabled: false });
    expect(call.create.logoKey).toMatch(/^giving\/church-1\//);
  });

  it("échec en base : la nouvelle clé est supprimée, l'ancienne conservée", async () => {
    prismaMock.church.findUnique.mockResolvedValue(churchWith(OLD_KEY));
    prismaMock.givingPage.upsert.mockRejectedValue(new Error("db down"));
    await expect(setGivingLogo("church-1", await image("png"), actor)).rejects.toThrow("db down");
    const newKey = uploadFile.mock.calls[0][0];
    expect(deleteMediaFile).toHaveBeenCalledWith(newKey);
    expect(deleteMediaFile).not.toHaveBeenCalledWith(OLD_KEY);
    expect(alertPaymentDetailsChange).not.toHaveBeenCalled();
  });

  it("fichier refusé : rien n'est écrit", async () => {
    await expect(setGivingLogo("church-1", Buffer.from("<svg/>"), actor)).rejects.toMatchObject({ statusCode: 400 });
    expect(uploadFile).not.toHaveBeenCalled();
    expect(prismaMock.givingPage.upsert).not.toHaveBeenCalled();
  });
});

describe("getPublicGivingLogoStream (spec 066)", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["église inconnue", null],
    ["page absente", { givingPage: null }],
    ["page inactive", { givingPage: { enabled: false, logoKey: OLD_KEY } }],
    ["sans logo", { givingPage: { enabled: true, logoKey: null } }],
  ])("null : %s", async (_label, found) => {
    prismaMock.church.findUnique.mockResolvedValue(found);
    expect(await getPublicGivingLogoStream("icc-rennes")).toBeNull();
    expect(getS3ObjectStream).not.toHaveBeenCalled();
  });

  it("flux du logo si la page est active", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ givingPage: { enabled: true, logoKey: OLD_KEY } });
    getS3ObjectStream.mockResolvedValue("stream");
    expect(await getPublicGivingLogoStream("icc-rennes")).toBe("stream");
    expect(getS3ObjectStream).toHaveBeenCalledWith(OLD_KEY);
  });
});
