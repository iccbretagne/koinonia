// Génère les icônes PNG de l'application (spec 068) depuis public/brand/koinonia-app-icon.svg.
// iOS n'accepte pas le SVG pour l'écran d'accueil, et les notifications ont besoin d'un PNG.
// Usage : node scripts/generate-app-icons.mjs
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const BRAND = new URL("../public/brand/", import.meta.url);
const source = await readFile(new URL("koinonia-app-icon.svg", BRAND), "utf8");

/** Le symbole seul (sans le carré blanc), pour recomposer les variantes. */
const mark = source.match(/<svg x="[^"]*"[\s\S]*<\/svg>\s*<\/svg>/)?.[0]?.replace(/<\/svg>\s*<\/svg>$/, "</svg>");
if (!mark) throw new Error("Symbole introuvable dans koinonia-app-icon.svg");

/** Symbole recentré dans un carré de 512, à l'échelle `scale` (zone sûre des icônes masquables). */
function composed({ background, scale, fill }) {
  const size = 512 * scale;
  const offset = (512 - size) / 2;
  let inner = mark.replace(/<svg x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*"/, `<svg x="${offset}" y="${offset + size * 0.203}" width="${size}" height="${size * 0.594}"`);
  if (fill) inner = inner.replace(/fill="#[0-9a-fA-F]{3,6}"/g, `fill="${fill}"`);
  const bg = background ? `<rect width="512" height="512" fill="${background}"/>` : "";
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${bg}${inner}</svg>`);
}

const outputs = [
  // Icônes standard : le SVG tel quel (carré blanc arrondi).
  { file: "koinonia-icon-192.png", input: Buffer.from(source), size: 192 },
  { file: "koinonia-icon-512.png", input: Buffer.from(source), size: 512 },
  // Masquable : fond plein, symbole dans la zone sûre (80 %).
  { file: "koinonia-icon-maskable-512.png", input: composed({ background: "#ffffff", scale: 0.7 }), size: 512 },
  // iOS arrondit lui-même : fond plein, sans coins.
  { file: "apple-touch-icon-180.png", input: composed({ background: "#ffffff", scale: 0.875 }), size: 180 },
  // Badge Android : silhouette blanche sur fond transparent.
  { file: "koinonia-badge-96.png", input: composed({ background: null, scale: 0.95, fill: "#ffffff" }), size: 96 },
];

for (const { file, input, size } of outputs) {
  await sharp(input, { density: 384 }).resize(size, size).png().toFile(new URL(file, BRAND).pathname);
  console.log(`public/brand/${file}`);
}
