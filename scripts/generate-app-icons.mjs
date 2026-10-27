// Génère les icônes PNG de l'application (spec 068) depuis public/brand/koinonia-app-icon-source.png
// (1024 × 1024, carré arrondi sur fond clair). iOS et Android exigent un fond plein : les coins
// clairs sont remplacés par le violet du fond, puis chaque variante est produite.
// Usage : node scripts/generate-app-icons.mjs
import sharp from "sharp";

const BRAND = new URL("../public/brand/", import.meta.url);
const SOURCE = new URL("koinonia-app-icon-source.png", BRAND).pathname;
const SIZE = 1024;
/** Violet du fond de l'icône, échantillonné dans l'image source. */
const BACKGROUND = { r: 12, g: 2, b: 45 };

/** Le carré arrondi de l'icône, rempli jusqu'aux bords avec le violet du fond. */
async function fullBleed() {
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><rect x="22" y="22" width="${SIZE - 44}" height="${SIZE - 44}" rx="190" fill="#fff"/></svg>`
  );
  const shape = await sharp(SOURCE).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  return sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { ...BACKGROUND, alpha: 1 } } })
    .composite([{ input: shape }])
    .png()
    .toBuffer();
}

/** Icône réduite au centre d'un fond plein : zone sûre des icônes masquables (cercle de 80 %). */
async function padded(icon, scale) {
  const inner = Math.round(SIZE * scale);
  const offset = Math.round((SIZE - inner) / 2);
  return sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { ...BACKGROUND, alpha: 1 } } })
    .composite([{ input: await sharp(icon).resize(inner, inner).png().toBuffer(), left: offset, top: offset }])
    .png()
    .toBuffer();
}

/** Silhouette blanche du « K » sur fond transparent (badge de notification Android). */
async function badge() {
  const region = { left: 300, top: 145, width: 465, height: 555 };
  const { data, info } = await sharp(SOURCE).extract(region).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const [r, g, b] = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
    // Le « K » est vif et clair, le fond violet très sombre : la luminosité maximale suffit.
    const alpha = Math.max(0, Math.min(255, (Math.max(r, g, b) - 120) * 3));
    out.set([255, 255, 255, alpha], i * 4);
  }
  const side = Math.max(info.width, info.height);
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize(side, side, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

const icon = await fullBleed();
const outputs = [
  { file: "koinonia-icon-192.png", input: icon, size: 192 },
  { file: "koinonia-icon-512.png", input: icon, size: 512 },
  { file: "koinonia-icon-maskable-512.png", input: await padded(icon, 0.72), size: 512 },
  { file: "apple-touch-icon-180.png", input: icon, size: 180 },
  { file: "favicon-48.png", input: icon, size: 48 },
  { file: "koinonia-badge-96.png", input: await badge(), size: 96 },
];

for (const { file, input, size } of outputs) {
  await sharp(input).resize(size, size).png().toFile(new URL(file, BRAND).pathname);
  console.log(`public/brand/${file}`);
}
