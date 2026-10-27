import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { fillCorners, renderAppIconVariants, renderBadge, suggestBackground } from "../app-icon-render";

const PURPLE = { r: 60, g: 20, b: 140 };

/** Carré arrondi violet sur fond blanc, comme une icône exportée « déjà arrondie ». */
async function roundedIcon(size = 600): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="#ffffff"/>
    <rect x="12" y="12" width="${size - 24}" height="${size - 24}" rx="${size * 0.2}" fill="rgb(60,20,140)"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 6}" fill="#ffffff"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function pixel(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

describe("app-icon-render (spec 069)", () => {
  it("suggestBackground : couleur du bord, hors coins clairs", async () => {
    expect(await suggestBackground(await roundedIcon())).toEqual(PURPLE);
  });

  it("fillCorners : coins clairs remplis par le fond, centre clair préservé", async () => {
    const out = await fillCorners(await roundedIcon(), { r: 1, g: 2, b: 3 });
    expect(await pixel(out, 0, 0)).toEqual({ r: 1, g: 2, b: 3, a: 255 });
    expect(await pixel(out, 1023, 1023)).toEqual({ r: 1, g: 2, b: 3, a: 255 });
    // Le cercle blanc central n'est pas relié aux coins : il reste blanc.
    expect(await pixel(out, 512, 512)).toEqual({ r: 255, g: 255, b: 255, a: 255 });
  });

  it("fillCorners : transparence remplacée par le fond", async () => {
    const transparent = await sharp({
      create: { width: 600, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const out = await fillCorners(transparent, PURPLE);
    expect(await pixel(out, 300, 300)).toEqual({ ...PURPLE, a: 255 });
  });

  it("renderAppIconVariants : dimensions, coins pleins, sans transparence", async () => {
    const variants = await renderAppIconVariants(await roundedIcon(), PURPLE);
    const expected = {
      "icon-192": 192,
      "icon-512": 512,
      "icon-maskable-512": 512,
      "apple-touch-180": 180,
      "favicon-48": 48,
    } as const;
    for (const [variant, size] of Object.entries(expected)) {
      const png = variants[variant as keyof typeof expected];
      const meta = await sharp(png).metadata();
      expect(meta.width).toBe(size);
      expect(meta.height).toBe(size);
      expect(meta.hasAlpha).toBe(false);
      expect(await pixel(png, 0, 0)).toEqual({ ...PURPLE, a: 255 });
    }
  });

  it("renderBadge : silhouette blanche, opacité conservée, 96 px", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="60" fill="rgb(200,0,0)"/></svg>`;
    const badge = await renderBadge(await sharp(Buffer.from(svg)).png().toBuffer());
    const meta = await sharp(badge).metadata();
    expect([meta.width, meta.height]).toEqual([96, 96]);
    expect(await pixel(badge, 48, 48)).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    expect((await pixel(badge, 0, 0)).a).toBe(0);
  });
});
