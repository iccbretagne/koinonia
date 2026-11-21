/** Tests — images d'un site d'événement (spec 084) : type vérifié, WebP sans métadonnées, lecture limitée au publié. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
const storeFile = vi.fn();
const readStoredFile = vi.fn();
vi.mock("@/lib/file-storage", () => ({ storeFile: (...a: unknown[]) => storeFile(...a), readStoredFile: (...a: unknown[]) => readStoredFile(...a), deleteFile: vi.fn() }));
const getSitesEnabled = vi.fn();
vi.mock("../services/site-settings", () => ({ getSitesEnabled: (...a: unknown[]) => getSitesEnabled(...a) }));

const { uploadAsset, readAsset } = await import("../services/site-assets");
const { defaultSiteDocument } = await import("../site-schemas");

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.ticketingSite.findUniqueOrThrow.mockResolvedValue({ churchId: "c1", eventId: "ev1" });
  prismaMock.ticketingSiteAsset.create.mockResolvedValue({ id: "a".repeat(25) });
});

/** JPEG avec orientation EXIF et un profil de métadonnées. */
async function jpegWithExif() {
  return sharp({ create: { width: 3000, height: 1000, channels: 3, background: "#336699" } })
    .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "secret" } } })
    .jpeg()
    .toBuffer();
}

describe("uploadAsset", () => {
  it("refuse un faux type (contenu qui n'est pas une image)", async () => {
    await expect(uploadAsset("s1", "u1", Buffer.from("<svg onload=alert(1)></svg>"))).rejects.toMatchObject({ statusCode: 400 });
    await expect(uploadAsset("s1", "u1", Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("pas du tout un jpeg")]))).rejects.toMatchObject({ statusCode: 400 });
    expect(storeFile).not.toHaveBeenCalled();
  });

  it("refuse plus de 8 Mo", async () => {
    await expect(uploadAsset("s1", "u1", Buffer.alloc(8 * 1024 * 1024 + 1))).rejects.toMatchObject({ statusCode: 400 });
  });

  it("sort un WebP redressé, ≤ 2400 px, sans métadonnées, sous la clé du site", async () => {
    const result = await uploadAsset("s1", "u1", await jpegWithExif());
    const [key, stored, mime] = storeFile.mock.calls[0];
    expect(key).toBe(`ticketing/c1/ev1/site/${"a".repeat(25)}.webp`);
    expect(mime).toBe("image/webp");
    const meta = await sharp(stored as Buffer).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(2400);
    // Orientation 6 appliquée : l'image 3000x1000 devient portrait.
    expect(meta.height!).toBeGreaterThan(meta.width!);
    expect(result).toMatchObject({ id: "a".repeat(25), width: meta.width, height: meta.height });
  });
});

describe("readAsset", () => {
  const id = "b".repeat(25);
  function asset(published: unknown, status = "OPEN") {
    prismaMock.ticketingSiteAsset.findUnique.mockResolvedValue({ id, key: "k", site: { id: "s1", churchId: "c1", published, event: { status } } });
    readStoredFile.mockResolvedValue(Buffer.from("img"));
    getSitesEnabled.mockResolvedValue(true);
  }
  const doc = (logo?: string) => {
    const d = defaultSiteDocument("Fête");
    if (logo) d.theme.logoAssetId = logo;
    return d;
  };

  it("public : servi seulement si la version publiée le référence", async () => {
    asset(doc(id));
    expect(await readAsset(id, { publishedOnly: true })).not.toBeNull();
    asset(doc());
    expect(await readAsset(id, { publishedOnly: true })).toBeNull();
  });

  it("public : jamais pour un site non publié, un événement en brouillon ou une église coupée", async () => {
    asset(null);
    expect(await readAsset(id, { publishedOnly: true })).toBeNull();
    asset(doc(id), "DRAFT");
    expect(await readAsset(id, { publishedOnly: true })).toBeNull();
    asset(doc(id));
    getSitesEnabled.mockResolvedValue(false);
    expect(await readAsset(id, { publishedOnly: true })).toBeNull();
  });

  it("équipe : tout asset de son site, jamais celui d'un autre site", async () => {
    asset(null);
    expect(await readAsset(id, { publishedOnly: false, siteId: "s1" })).not.toBeNull();
    expect(await readAsset(id, { publishedOnly: false, siteId: "autre" })).toBeNull();
  });
});
