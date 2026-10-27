import sharp from "sharp";
import type { AppIconImageVariant } from "../schemas";

/**
 * Rendu de l'icône de l'application (spec 069), pur sur buffers : aucune base, aucun fichier.
 * Partagé par le service de dépôt et par `scripts/generate-app-icons.ts` (icônes livrées).
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Côté de travail : l'image est ramenée à ce carré avant toute découpe. */
export const WORK_SIZE = 1024;
/** Zone sûre des icônes masquables (Android découpe en rond). */
export const MASKABLE_SCALE = 0.72;
/** Un pixel est « clair » au-delà de ce seuil sur ses trois canaux. */
const LIGHT_THRESHOLD = 200;
/** Seuil plus bas pour le liseré anticrénelé qui borde une zone remplie. */
const EDGE_THRESHOLD = 140;

const SIZES: Record<AppIconImageVariant, number> = {
  "icon-192": 192,
  "icon-512": 512,
  "icon-maskable-512": 512,
  "apple-touch-180": 180,
  "favicon-48": 48,
};

export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

async function workingRaw(buffer: Buffer) {
  return sharp(buffer)
    .rotate()
    .resize(WORK_SIZE, WORK_SIZE, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

type Raw = { data: Buffer; width: number; height: number };

function isFillable(data: Buffer, i: number, threshold: number): boolean {
  return data[i + 3] < 128 || (data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold);
}

function neighbours(p: number, width: number, height: number): number[] {
  const x = p % width;
  const out: number[] = [];
  if (x > 0) out.push(p - 1);
  if (x < width - 1) out.push(p + 1);
  if (p >= width) out.push(p - width);
  if (p + width < width * height) out.push(p + width);
  return out;
}

/** Pixels transparents ou clairs reliés à l'un des quatre angles (diffusion). */
function floodFromCorners({ data, width, height }: Raw): Uint8Array {
  const filled = new Uint8Array(width * height);
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];
  const stack = corners.filter((p) => isFillable(data, p * 4, LIGHT_THRESHOLD));
  while (stack.length > 0) {
    const p = stack.pop()!;
    if (filled[p]) continue;
    filled[p] = 1;
    for (const q of neighbours(p, width, height)) {
      if (!filled[q] && isFillable(data, q * 4, LIGHT_THRESHOLD)) stack.push(q);
    }
  }
  return filled;
}

/** Remplacé par le fond : zone diffusée, ou liseré clair d'un pixel qui la borde. */
function isReplaced(raw: Raw, filled: Uint8Array, p: number): boolean {
  if (filled[p] === 1) return true;
  if (!isFillable(raw.data, p * 4, EDGE_THRESHOLD)) return false;
  return neighbours(p, raw.width, raw.height).some((q) => filled[q] === 1);
}

/**
 * Remplit avec `background` les coins transparents ou clairs d'une icône déjà arrondie : un
 * remplissage par diffusion part des quatre angles et ne traverse que des pixels transparents
 * ou clairs, puis un liseré d'un pixel adoucit le bord anticrénelé. Le reste de l'image est posé
 * sur le fond plein : le résultat n'a aucune transparence.
 */
export async function fillCorners(buffer: Buffer, background: Rgb): Promise<Buffer> {
  const { data, info } = await workingRaw(buffer);
  const raw: Raw = { data, width: info.width, height: info.height };
  const filled = floodFromCorners(raw);
  const out = Buffer.alloc(raw.width * raw.height * 3);
  for (let p = 0; p < raw.width * raw.height; p++) {
    const i = p * 4;
    const alpha = isReplaced(raw, filled, p) ? 0 : data[i + 3] / 255;
    out[p * 3] = Math.round(data[i] * alpha + background.r * (1 - alpha));
    out[p * 3 + 1] = Math.round(data[i + 1] * alpha + background.g * (1 - alpha));
    out[p * 3 + 2] = Math.round(data[i + 2] * alpha + background.b * (1 - alpha));
  }
  return sharp(out, { raw: { width: raw.width, height: raw.height, channels: 3 } }).png().toBuffer();
}

/** Icône réduite au centre d'un fond plein (zone sûre des icônes masquables). */
async function padded(icon: Buffer, background: Rgb, scale: number): Promise<Buffer> {
  const inner = Math.round(WORK_SIZE * scale);
  const offset = Math.round((WORK_SIZE - inner) / 2);
  return sharp({ create: { width: WORK_SIZE, height: WORK_SIZE, channels: 3, background } })
    .composite([{ input: await sharp(icon).resize(inner, inner).png().toBuffer(), left: offset, top: offset }])
    .png()
    .toBuffer();
}

/** Toutes les tailles servies, à partir d'une icône carrée quelconque. */
export async function renderAppIconVariants(
  buffer: Buffer,
  background: Rgb
): Promise<Record<AppIconImageVariant, Buffer>> {
  const icon = await fillCorners(buffer, background);
  const maskable = await padded(icon, background, MASKABLE_SCALE);
  const entries = await Promise.all(
    (Object.keys(SIZES) as AppIconImageVariant[]).map(async (variant) => {
      const source = variant === "icon-maskable-512" ? maskable : icon;
      const size = SIZES[variant];
      const png = await sharp(source).resize(size, size).removeAlpha().png().toBuffer();
      return [variant, png] as const;
    })
  );
  return Object.fromEntries(entries) as Record<AppIconImageVariant, Buffer>;
}

/**
 * Silhouette des notifications Android : seule l'opacité de l'image est gardée, peinte en blanc,
 * centrée sur 96 × 96 transparent.
 */
export async function renderBadge(buffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buffer).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let p = 0; p < info.width * info.height; p++) {
    out.set([255, 255, 255, data[p * 4 + 3]], p * 4);
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize(96, 96, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Couleur de fond proposée : médiane d'une bande prise à 8 % des bords, sur le tiers central de
 * chaque côté (les coins, souvent clairs ou transparents, sont exclus). Blanc par défaut.
 */
export async function suggestBackground(buffer: Buffer): Promise<Rgb> {
  const size = 100;
  const { data } = await sharp(buffer)
    .rotate()
    .resize(size, size, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const band = Math.round(size * 0.08);
  const samples: Rgb[] = [];
  const take = (x: number, y: number) => {
    const i = (y * size + x) * 4;
    if (data[i + 3] >= 200) samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
  };
  for (let t = Math.round(size / 3); t < Math.round((2 * size) / 3); t++) {
    take(t, band);
    take(t, size - 1 - band);
    take(band, t);
    take(size - 1 - band, t);
  }
  if (samples.length === 0) return { r: 255, g: 255, b: 255 };
  return {
    r: median(samples.map((s) => s.r)),
    g: median(samples.map((s) => s.g)),
    b: median(samples.map((s) => s.b)),
  };
}
