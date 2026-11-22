/** Tests — images d'un site d'événement (spec 084) : type vérifié, WebP sans métadonnées, lecture limitée au publié. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
const storeFile = vi.fn();
const readStoredFile = vi.fn();
const deleteFile = vi.fn(async (..._a: unknown[]) => undefined);
const storedFileExists = vi.fn(async (..._a: unknown[]) => true);
vi.mock("@/lib/file-storage", () => ({ storeFile: (...a: unknown[]) => storeFile(...a), readStoredFile: (...a: unknown[]) => readStoredFile(...a), deleteFile: (...a: unknown[]) => deleteFile(...a), storedFileExists: (...a: unknown[]) => storedFileExists(...a) }));
const getSitesEnabled = vi.fn();
vi.mock("../services/site-settings", () => ({ getSitesEnabled: (...a: unknown[]) => getSitesEnabled(...a) }));

const { missingAssetFiles, sniffSvg, copyAssets, exportAssets, discardSiteAssets, uploadAsset, stageAsset, confirmAsset, purgePendingAssets, deleteAsset, listAssets, decodeBase64Image, readAsset } = await import("../services/site-assets");
const { defaultSiteDocument, remapAssetIds, assetIdsOf } = await import("../site-schemas");

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.ticketingSite.findUniqueOrThrow.mockResolvedValue({ churchId: "c1", eventId: "ev1" });
  prismaMock.ticketingSiteAsset.create.mockResolvedValue({ id: "a".repeat(25) });
  // Le service écrit les variantes, puis la confirmation les relit : le « stockage » retient la dernière.
  let variants: unknown = null;
  prismaMock.ticketingSiteAsset.update.mockImplementation((async ({ data }: { data: { variants?: unknown } }) => {
    if (data.variants) variants = data.variants;
    return {};
  }) as never);
  prismaMock.ticketingSiteAsset.findFirst.mockImplementation((async () => ({ id: "a".repeat(25), bytes: 1, name: "", width: 1, height: 1, variants, site: { churchId: "c1" } })) as never);
});

/** JPEG avec orientation EXIF et un profil de métadonnées. */
async function jpegWithExif() {
  return sharp({ create: { width: 3000, height: 1000, channels: 3, background: "#336699" } })
    .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "secret" } } })
    .jpeg()
    .toBuffer();
}

const ALT = { alt: "Une salle décorée" };
const png = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#336699" } }).png().toBuffer();
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400"><rect width="800" height="400" fill="#c00"/><text x="10" y="50">Salut</text></svg>`;

describe("uploadAsset", () => {
  it("refuse un faux type (contenu qui n'est pas une image)", async () => {
    await expect(uploadAsset("s1", "u1", Buffer.from("<html>pas une image</html>"), ALT)).rejects.toMatchObject({ statusCode: 400 });
    await expect(uploadAsset("s1", "u1", Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("pas du tout un jpeg")]), ALT)).rejects.toMatchObject({ statusCode: 400 });
    expect(storeFile).not.toHaveBeenCalled();
  });

  it("refuse plus de 8 Mo", async () => {
    await expect(uploadAsset("s1", "u1", Buffer.alloc(8 * 1024 * 1024 + 1), ALT)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("texte alternatif obligatoire (1 à 200 caractères)", async () => {
    const image = await png(100, 100);
    for (const alt of ["", "   ", "x".repeat(201)]) await expect(uploadAsset("s1", "u1", image, { alt })).rejects.toMatchObject({ statusCode: 400 });
    expect(storeFile).not.toHaveBeenCalled();
  });

  it("dimensions refusées : trop petite, trop grande, trop de pixels", async () => {
    await expect(uploadAsset("s1", "u1", await png(15, 400), ALT)).rejects.toThrow(/trop petite/);
    await expect(uploadAsset("s1", "u1", await png(8001, 16), ALT)).rejects.toThrow(/trop grande/);
    await expect(uploadAsset("s1", "u1", await png(7000, 6000), ALT)).rejects.toThrow(/trop grande/);
    expect(storeFile).not.toHaveBeenCalled();
  });

  it("sort des WebP redressés (640, 1280, 2400), sans métadonnées, la plus grande sous la clé de l'image", async () => {
    const result = await uploadAsset("s1", "u1", await jpegWithExif(), { ...ALT, name: "salle.jpg" });
    const id = "a".repeat(25);
    const base = `ticketing/c1/ev1/site/${id}`;
    expect(storeFile.mock.calls.map((c) => c[0])).toEqual([`${base}-640.webp`, `${base}.webp`]);
    // JPEG 3000x1000 orienté 6 : portrait 1000x3000 après rotation, donc 640 puis 1000 (original).
    const widths = await Promise.all(storeFile.mock.calls.map(async (c) => (await sharp(c[1] as Buffer).metadata())));
    for (const m of widths) {
      expect(m.format).toBe("webp");
      expect(m.exif).toBeUndefined();
    }
    expect(widths.map((m) => m.width)).toEqual([640, 1000]);
    expect(widths.every((m) => m.height! > m.width!)).toBe(true);
    expect(result).toMatchObject({ id, width: 1000, height: 3000 });
    const created = prismaMock.ticketingSiteAsset.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ siteId: "s1", key: "pending", name: "salle.jpg", alt: ALT.alt });
    const variants = prismaMock.ticketingSiteAsset.update.mock.calls[0][0].data.variants as { w: number; key: string }[];
    expect(variants.map((v) => v.w)).toEqual([640, 1000]);
    expect(variants.at(-1)!.key).toBe(`${base}.webp`);
  });

  it("variantes 640, 1280 et 2400 pour une grande image, sans agrandir une petite", async () => {
    await uploadAsset("s1", "u1", await png(3000, 1500), ALT);
    expect(await Promise.all(storeFile.mock.calls.map(async (c) => (await sharp(c[1] as Buffer).metadata()).width))).toEqual([640, 1280, 2400]);
    storeFile.mockClear();
    await uploadAsset("s1", "u1", await png(300, 200), ALT);
    expect(await Promise.all(storeFile.mock.calls.map(async (c) => (await sharp(c[1] as Buffer).metadata()).width))).toEqual([300]);
  });

  it("SVG rastérisé en WebP : aucun SVG n'est stocké", async () => {
    const result = await uploadAsset("s1", "u1", Buffer.from(SVG), ALT);
    expect(result.width).toBeGreaterThan(16);
    for (const [, stored, mime] of storeFile.mock.calls) {
      expect(mime).toBe("image/webp");
      expect((stored as Buffer).toString("utf8", 0, 4)).toBe("RIFF");
      expect((stored as Buffer).includes(Buffer.from("<svg"))).toBe(false);
      expect((await sharp(stored as Buffer).metadata()).format).toBe("webp");
    }
  });

  it("SVG actif ou référençant l'extérieur : refusé", async () => {
    const bad = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>alert(1)</script></svg>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><image href="http://127.0.0.1/secret.png" width="100" height="100"/></svg>`,
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="100"><image xlink:href="file:///etc/passwd"/></svg>`,
      `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text>&x;</text></svg>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect style="fill:url(http://exemple.org/x)" width="100" height="100"/></svg>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><style>@import "http://exemple.org/x.css";</style><rect width="100" height="100"/></svg>`,
    ];
    for (const svg of bad) await expect(uploadAsset("s1", "u1", Buffer.from(svg), ALT), svg).rejects.toMatchObject({ statusCode: 400 });
    // UTF-16 : les contrôles textuels ne verraient rien, l'image est refusée.
    await expect(uploadAsset("s1", "u1", Buffer.from(`\uFEFF${SVG.replace("<text", "<script>alert(1)</script><text")}`, "utf16le"), ALT)).rejects.toMatchObject({ statusCode: 400 });
    expect(storeFile).not.toHaveBeenCalled();
  });

  it("base64 : data-URL ou brut, même limite", () => {
    const b = Buffer.from("hello");
    expect(decodeBase64Image(b.toString("base64")).toString()).toBe("hello");
    expect(decodeBase64Image(`data:image/png;base64,${b.toString("base64")}`).toString()).toBe("hello");
    expect(() => decodeBase64Image("pas du base64 !!")).toThrow(/base64/);
    expect(() => decodeBase64Image("A".repeat(12_000_000))).toThrow(/trop lourde/);
  });
});

describe("stageAsset / confirmAsset / purge", () => {
  it("l'image en attente n'est pas servie ; la confirmation la finalise ; l'inexistante est refusée", async () => {
    await stageAsset("s1", await png(100, 100), ALT);
    expect(prismaMock.ticketingSiteAsset.update.mock.calls.some((c) => "key" in c[0].data)).toBe(false);
    prismaMock.ticketingSiteAsset.findFirst.mockResolvedValue({ id: "x", bytes: 1, name: "", width: 1, height: 1, variants: [{ w: 100, key: "k/x.webp", bytes: 1 }], site: { churchId: "c1" } });
    await confirmAsset("s1", "x", "u1");
    expect(prismaMock.ticketingSiteAsset.update).toHaveBeenLastCalledWith({ where: { id: "x" }, data: { key: "k/x.webp" } });
    prismaMock.ticketingSiteAsset.findFirst.mockResolvedValue(null);
    await expect(confirmAsset("s1", "x", "u1")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("purge : les images en attente de plus d'une heure sont supprimées, fichiers compris", async () => {
    prismaMock.ticketingSiteAsset.findMany.mockResolvedValue([{ id: "p1", variants: [{ w: 640, key: "k/p1-640.webp" }, { w: 1000, key: "k/p1.webp" }] }]);
    const now = new Date("2030-01-01T12:00:00Z");
    expect(await purgePendingAssets(now)).toBe(1);
    expect(prismaMock.ticketingSiteAsset.findMany.mock.calls[0][0].where).toEqual({ key: "pending", createdAt: { lt: new Date("2030-01-01T11:00:00Z") } });
    expect(deleteFile).toHaveBeenCalledWith("k/p1-640.webp");
    expect(deleteFile).toHaveBeenCalledWith("k/p1.webp");
    expect(prismaMock.ticketingSiteAsset.deleteMany).toHaveBeenCalledWith({ where: { id: "p1", key: "pending" } });
  });
});

describe("deleteAsset / listAssets", () => {
  const id = "c".repeat(25);
  const row = { id, siteId: "s1", key: `k/${id}.webp`, name: "logo", alt: "Logo", width: 800, height: 400, bytes: 10, variants: [{ w: 640, key: `k/${id}-640.webp`, bytes: 5 }, { w: 800, key: `k/${id}.webp`, bytes: 10 }], createdAt: new Date("2030-01-01"), site: { churchId: "c1" } };
  const draftWith = (assetId?: string) => {
    const d = defaultSiteDocument("Fête");
    if (assetId) d.theme.logoAssetId = assetId;
    return d;
  };

  it("refusée si l'image est utilisée dans le brouillon, et dit où", async () => {
    prismaMock.ticketingSiteAsset.findFirst.mockResolvedValue(row);
    prismaMock.ticketingSite.findUniqueOrThrow.mockResolvedValue({ draft: draftWith(id), published: null });
    await expect(deleteAsset("s1", id, "u1")).rejects.toThrow(/brouillon › thème › logo/);
    expect(prismaMock.ticketingSiteAsset.delete).not.toHaveBeenCalled();
  });

  it("refusée si l'image n'est utilisée que par la version publiée", async () => {
    prismaMock.ticketingSiteAsset.findFirst.mockResolvedValue(row);
    prismaMock.ticketingSite.findUniqueOrThrow.mockResolvedValue({ draft: draftWith(), published: draftWith(id) });
    await expect(deleteAsset("s1", id, "u1")).rejects.toThrow(/version publiée › thème › logo/);
    expect(prismaMock.ticketingSiteAsset.delete).not.toHaveBeenCalled();
  });

  it("inutilisée : supprimée avec toutes ses variantes", async () => {
    prismaMock.ticketingSiteAsset.findFirst.mockResolvedValue(row);
    prismaMock.ticketingSite.findUniqueOrThrow.mockResolvedValue({ draft: draftWith(), published: null });
    await deleteAsset("s1", id, "u1");
    expect(prismaMock.ticketingSiteAsset.delete).toHaveBeenCalled();
    expect(deleteFile.mock.calls.map((c) => c[0]).sort()).toEqual([`k/${id}-640.webp`, `k/${id}.webp`]);
  });

  it("liste : emplacements du brouillon et du publié", async () => {
    prismaMock.ticketingSiteAsset.findMany.mockResolvedValue([row]);
    prismaMock.ticketingSite.findUniqueOrThrow.mockResolvedValue({ draft: draftWith(id), published: null });
    const [view] = await listAssets("s1");
    expect(view).toMatchObject({ id, name: "logo", alt: "Logo", variants: [{ w: 640, bytes: 5 }, { w: 800, bytes: 10 }], usedIn: { draft: ["thème › logo"], published: [] } });
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

  it("variante demandée : la plus proche par le haut, la plus grande à défaut, l'original sans variantes", async () => {
    const withVariants = (variants: unknown) => {
      prismaMock.ticketingSiteAsset.findUnique.mockResolvedValue({ id, key: "k/orig.webp", variants, site: { id: "s1", churchId: "c1", published: null, event: { status: "OPEN" } } });
      readStoredFile.mockResolvedValue(Buffer.from("img"));
    };
    const vs = [{ w: 640, key: "k/640.webp" }, { w: 1280, key: "k/1280.webp" }, { w: 1500, key: "k/big.webp" }];
    withVariants(vs);
    await readAsset(id, { publishedOnly: false, siteId: "s1" }, 1280);
    expect(readStoredFile).toHaveBeenLastCalledWith("k/1280.webp");
    await readAsset(id, { publishedOnly: false, siteId: "s1" }, 700);
    expect(readStoredFile).toHaveBeenLastCalledWith("k/1280.webp");
    await readAsset(id, { publishedOnly: false, siteId: "s1" }, 2400);
    expect(readStoredFile).toHaveBeenLastCalledWith("k/big.webp");
    await readAsset(id, { publishedOnly: false, siteId: "s1" });
    expect(readStoredFile).toHaveBeenLastCalledWith("k/orig.webp");
    withVariants(null);
    await readAsset(id, { publishedOnly: false, siteId: "s1" }, 640);
    expect(readStoredFile).toHaveBeenLastCalledWith("k/orig.webp");
  });
});

describe("copie, export et nettoyage", () => {
  const row = (id: string, extra = {}) => ({ id, siteId: "src", key: `k/${id}.webp`, name: "logo", alt: "Logo", width: 1200, height: 600, bytes: 9, variants: [{ w: 640, key: `k/${id}-640.webp`, bytes: 4 }, { w: 1200, key: `k/${id}.webp`, bytes: 9 }], createdAt: new Date(), ...extra });

  it("copyAssets : fichiers et lignes copiés vers le site cible, ancien → nouvel identifiant", async () => {
    prismaMock.ticketingSiteAsset.findMany.mockResolvedValue([row("x".repeat(25))]);
    prismaMock.ticketingSite.findUniqueOrThrow.mockResolvedValue({ churchId: "c1", eventId: "ev-new" });
    prismaMock.ticketingSiteAsset.create.mockResolvedValue({ id: "y".repeat(25) });
    readStoredFile.mockResolvedValue(Buffer.from("webp"));
    const map = await copyAssets("src", "dst");
    expect(map.get("x".repeat(25))).toBe("y".repeat(25));
    expect(storeFile.mock.calls.map((c) => c[0])).toEqual([`ticketing/c1/ev-new/site/${"y".repeat(25)}-640.webp`, `ticketing/c1/ev-new/site/${"y".repeat(25)}.webp`]);
    expect(prismaMock.ticketingSiteAsset.create.mock.calls[0][0].data).toMatchObject({ siteId: "dst", key: "pending", name: "logo", alt: "Logo" });
    expect(prismaMock.ticketingSiteAsset.update.mock.calls.at(-1)![0].data.key).toBe(`ticketing/c1/ev-new/site/${"y".repeat(25)}.webp`);
  });

  it("exportAssets : variante de 1280 px au plus, en WebP base64 ; rien sans identifiant", async () => {
    expect(await exportAssets("src", [])).toEqual([]);
    prismaMock.ticketingSiteAsset.findMany.mockResolvedValue([row("x".repeat(25), { variants: [{ w: 640, key: "k/640" }, { w: 1280, key: "k/1280" }, { w: 2400, key: "k/2400" }] })]);
    readStoredFile.mockResolvedValue(Buffer.from("webp"));
    const [out] = await exportAssets("src", ["x".repeat(25)]);
    expect(readStoredFile).toHaveBeenLastCalledWith("k/1280");
    expect(out).toEqual({ id: "x".repeat(25), name: "logo", alt: "Logo", mime: "image/webp", base64: Buffer.from("webp").toString("base64") });
  });

  it("discardSiteAssets : fichiers puis lignes supprimés", async () => {
    prismaMock.ticketingSiteAsset.findMany.mockResolvedValue([{ id: "p", key: "k/p.webp", variants: [{ w: 640, key: "k/p-640.webp" }, { w: 900, key: "k/p.webp" }] }]);
    await discardSiteAssets("dst");
    expect(deleteFile.mock.calls.map((c) => c[0]).sort()).toEqual(["k/p-640.webp", "k/p.webp"]);
    expect(prismaMock.ticketingSiteAsset.deleteMany).toHaveBeenCalledWith({ where: { siteId: "dst" } });
  });

  it("remapAssetIds : toutes les références sont remplacées (thème, fonds, blocs), l'original intact", () => {
    const A = "a".repeat(25);
    const B = "b".repeat(25);
    const doc = defaultSiteDocument("N");
    doc.theme.logoAssetId = A;
    doc.theme.background = { kind: "image", assetId: A, veil: "background", opacity: 0.5, fixed: false };
    doc.pages[0].sections[0].blocks.push({ kind: "gallery", images: [{ assetId: A, alt: "x" }, { assetId: B, alt: "y" }] }, { kind: "hero", title: "T", showDateLocation: true, showCountdown: false, background: { kind: "image", assetId: B, veil: "background", opacity: 0.5, fixed: false } });
    const next = remapAssetIds(doc, new Map([[A, "1".repeat(25)], [B, "2".repeat(25)]]));
    expect([...assetIdsOf(next)].sort()).toEqual(["1".repeat(25), "2".repeat(25)]);
    expect([...assetIdsOf(doc)].sort()).toEqual([A, B]);
  });
});

describe("sniffSvg", () => {
  const svg = (s: string) => sniffSvg(Buffer.from(s));
  it("prologue, commentaires et doctype avant <svg>", () => {
    expect(svg('<?xml version="1.0"?>\n<!-- a --><!-- b -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN">\n<svg xmlns="x">')).toBe(true);
    expect(svg("<svg>")).toBe(true);
    expect(svg("<html><svg>")).toBe(false);
    expect(svg("<!-- jamais fermé <svg>")).toBe(false);
  });
  it("pas de backtracking sur des commentaires répétés", () => {
    const start = performance.now();
    expect(svg("<!--" + "--><!--".repeat(2000) + "x")).toBe(false);
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe("missingAssetFiles", () => {
  it("signale une image dont une variante manque, absente ou en attente ; rien si tout est stocké", async () => {
    prismaMock.ticketingSiteAsset.findMany.mockResolvedValue([
      { id: "ok", key: "k/ok.webp", name: "Bannière", variants: [{ w: 640, key: "k/ok-640.webp" }, { w: 2400, key: "k/ok.webp" }] },
      { id: "lost", key: "k/lost.webp", name: "Femmes", variants: [{ w: 640, key: "k/lost-640.webp" }, { w: 2400, key: "k/lost.webp" }] },
      { id: "wait", key: "pending", name: "Enfants", variants: null },
    ] as never);
    storedFileExists.mockImplementation(async (k: unknown) => k !== "k/lost-640.webp");
    expect(await missingAssetFiles("s1", ["ok", "lost", "wait", "gone"])).toEqual(["Femmes", "Enfants", "gone"]);
    expect(await missingAssetFiles("s1", [])).toEqual([]);
  });
});
