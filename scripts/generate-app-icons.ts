// Génère les icônes livrées avec Koinonia (specs 068 et 069) depuis
// public/brand/koinonia-app-icon-source.png (1024 × 1024, carré arrondi sur fond clair), avec le
// même rendu que l'écran « Icône de l'application » : coins clairs remplis du violet du fond,
// puis chaque taille. Produit aussi le badge « K » et la cloche générique des notifications.
// Usage : npm run icons
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { renderAppIconVariants, type Rgb } from "../src/modules/core/services/app-icon-render";
import type { AppIconImageVariant } from "../src/modules/core/schemas";

const BRAND = new URL("../public/brand/", `file://${__filename}`);
const SOURCE = new URL("koinonia-app-icon-source.png", BRAND).pathname;
/** Violet du fond de l'icône, échantillonné dans l'image source. */
const BACKGROUND: Rgb = { r: 12, g: 2, b: 45 };

const FILES: Record<AppIconImageVariant, string> = {
  "icon-192": "koinonia-icon-192.png",
  "icon-512": "koinonia-icon-512.png",
  "icon-maskable-512": "koinonia-icon-maskable-512.png",
  "apple-touch-180": "apple-touch-icon-180.png",
  "favicon-48": "favicon-48.png",
};

/**
 * La source a un liseré clair autour de son carré arrondi : il est découpé (transparent) avant
 * le rendu, qui remplit ensuite cette zone du violet du fond.
 */
async function cropRim(source: Buffer): Promise<Buffer> {
  const size = 1024;
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect x="22" y="22" width="${size - 44}" height="${size - 44}" rx="190" fill="#fff"/></svg>`
  );
  return sharp(source).resize(size, size).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

/** Silhouette blanche du « K » sur fond transparent (badge de notification Android). */
async function kBadge(source: Buffer): Promise<Buffer> {
  const region = { left: 300, top: 145, width: 465, height: 555 };
  const { data, info } = await sharp(source).extract(region).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const [r, g, b] = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
    // Le « K » est vif et clair, le fond violet très sombre : la luminosité maximale suffit.
    const alpha = Math.max(0, Math.min(255, (Math.max(r, g, b) - 120) * 3));
    out.set([255, 255, 255, alpha], i * 4);
  }
  const side = Math.max(info.width, info.height);
  const square = await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize(side, side, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp(square).resize(96, 96).png().toBuffer();
}

/** Cloche blanche pleine (badge générique, sous une icône déposée sans silhouette). */
async function bellBadge(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24">
  <path fill="#fff" d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>
  <path fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" d="M10.268 21a2 2 0 0 0 3.464 0"/>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  const source = await readFile(SOURCE);
  const variants = await renderAppIconVariants(await cropRim(source), BACKGROUND);
  const outputs: [string, Buffer][] = [
    ...(Object.keys(FILES) as AppIconImageVariant[]).map((v) => [FILES[v], variants[v]] as [string, Buffer]),
    ["koinonia-badge-96.png", await kBadge(source)],
    ["badge-bell-96.png", await bellBadge()],
  ];

  for (const [file, png] of outputs) {
    await writeFile(new URL(file, BRAND).pathname, png);
    console.log(`public/brand/${file}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
