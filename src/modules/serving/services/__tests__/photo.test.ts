import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("@/modules/storage", () => ({ uploadFile: vi.fn(), downloadFile: vi.fn(), deleteMediaFile: vi.fn() }));

const { normalizePhoto } = await import("../photo");

async function png(width = 300, height = 300) {
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 60, b: 200 } } })
    .withMetadata({ exif: { IFD0: { Artist: "Marie", Copyright: "GPS 48.11,-1.68" } } })
    .png()
    .toBuffer();
}

describe("normalizePhoto", () => {
  it("réencode un PNG en JPEG 600×800 sans métadonnées", async () => {
    const out = await normalizePhoto(await png());
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(600);
    expect(meta.height).toBe(800);
    expect(meta.exif).toBeUndefined();
  });

  it("refuse un SVG, même nommé comme une image", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    await expect(normalizePhoto(svg)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuse un fichier qui n'est pas une image", async () => {
    await expect(normalizePhoto(Buffer.from("%PDF-1.4 pas une photo"))).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuse un fichier vide", async () => {
    await expect(normalizePhoto(Buffer.alloc(0))).rejects.toMatchObject({ statusCode: 400 });
  });
});
