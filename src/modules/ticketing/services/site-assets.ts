import { ApiError } from "@/lib/errors";
import { siteDocumentSchema, assetIdsOf, assetUsagesOf } from "../site-schemas";
import { sniffImage } from "./events";

/**
 * Images d'un site d'événement (spec 084). Le fichier déposé n'est jamais servi tel quel : seules
 * des variantes WebP réencodées (orientation appliquée, sans aucune métadonnée) sont gardées. Les
 * SVG sont rastérisés puis traités comme les autres : aucun SVG n'est stocké ni servi.
 *
 * Deux temps : `stageAsset` traite et stocke (ligne `key = "pending"`), `confirmAsset` finalise.
 * Les images jamais confirmées sont purgées par `purgePendingAssets` (tâche billetterie).
 */

export const MAX_BYTES = 8 * 1024 * 1024;
export const MAX_SIDE = 8000;
export const MAX_PIXELS = 40_000_000;
export const MIN_SIDE = 16;
export const VARIANT_WIDTHS = [640, 1280, 2400] as const;
const PENDING_TTL_MS = 60 * 60 * 1000;
/** Densité de rastérisation d'un SVG (72 dpi = taille nominale). */
const SVG_DENSITY = 150;

export interface StoredVariant {
  w: number;
  key: string;
  bytes: number;
}

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

// ─── Entrées ─────────────────────────────────────────────────────────────────

/** SVG ? Le contenu doit commencer (prologue XML, commentaires, doctype) par `<svg`. */
export function sniffSvg(buffer: Buffer): boolean {
  // Lecture pas à pas plutôt qu'une regex à répétitions imbriquées (backtracking exponentiel).
  let rest = buffer.subarray(0, 4096).toString("utf8").replace(/^﻿/, "").trimStart();
  const skip = (open: string, close: string): boolean => {
    if (!rest.toLowerCase().startsWith(open)) return false;
    const end = rest.indexOf(close, open.length);
    if (end < 0) return false;
    rest = rest.slice(end + close.length).trimStart();
    return true;
  };
  skip("<?xml", "?>");
  while (skip("<!--", "-->"));
  if (/^<!doctype[^>[]*>/i.test(rest)) rest = rest.slice(rest.indexOf(">") + 1).trimStart();
  return /^<svg[\s>]/i.test(rest);
}

/** Un SVG ne doit rien charger ni exécuter : ni entité, ni script, ni objet étranger, ni référence externe. */
export function assertSafeSvg(buffer: Buffer): void {
  const text = buffer.toString("utf8");
  // UTF-16 ou octets nuls : les contrôles textuels ci-dessous ne verraient rien.
  if (buffer.includes(0) || text.includes("\uFFFD")) throw new ApiError(400, "SVG refusé : encodage non pris en charge (UTF-8 attendu)");
  if (/@import/i.test(text)) throw new ApiError(400, "SVG refusé : références externes non autorisées");
  if (/<!ENTITY|<script|<foreignObject|<iframe|<embed|<object/i.test(text)) throw new ApiError(400, "SVG refusé : contenu actif ou entités non autorisés");
  for (const m of text.matchAll(/(?:xlink:)?href\s*=\s*["']([^"']*)["']/gi)) {
    if (!/^(#|data:image\/(png|jpe?g|webp);)/i.test(m[1].trim())) throw new ApiError(400, "SVG refusé : références externes non autorisées");
  }
  for (const m of text.matchAll(/url\(\s*["']?([^"')]*)/gi)) {
    if (!m[1].trim().startsWith("#") && !/^data:image\//i.test(m[1].trim())) throw new ApiError(400, "SVG refusé : références externes non autorisées");
  }
}

/** Base64 brut ou data-URL → octets (même limite de poids que les autres images). */
export function decodeBase64Image(input: string): Buffer {
  const raw = input.trim().replace(/^data:[^;,]*(;[^;,]*)*;base64,/i, "");
  if (raw.length > Math.ceil((MAX_BYTES * 4) / 3) + 8) throw new ApiError(400, "Image trop lourde (8 Mo au plus)");
  if (!raw || !/^[A-Za-z0-9+/\s]+={0,2}\s*$/.test(raw)) throw new ApiError(400, "Image illisible : base64 invalide");
  const buffer = Buffer.from(raw, "base64");
  if (buffer.length > MAX_BYTES) throw new ApiError(400, "Image trop lourde (8 Mo au plus)");
  return buffer;
}

export interface ProcessedImage {
  width: number;
  height: number;
  source: "jpeg" | "png" | "webp" | "svg";
  variants: { w: number; data: Buffer; height: number }[];
}

/** Valide (poids, type sur le contenu, dimensions) et produit les variantes WebP. */
export async function processImage(buffer: Buffer): Promise<ProcessedImage> {
  if (buffer.length > MAX_BYTES) throw new ApiError(400, "Image trop lourde (8 Mo au plus)");
  const raster = sniffImage(buffer);
  const svg = !raster && sniffSvg(buffer);
  if (!raster && !svg) throw new ApiError(400, "Format d'image non pris en charge (JPEG, PNG, WebP ou SVG)");
  if (svg) assertSafeSvg(buffer);
  const sharp = (await import("sharp")).default;
  const open = () => sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: "error", ...(svg ? { density: SVG_DENSITY } : {}) });
  try {
    // Dimensions après orientation (EXIF 5 à 8 : côtés échangés).
    const meta = await open().metadata();
    const swap = ((meta as { orientation?: number }).orientation ?? 1) >= 5;
    const w0 = (swap ? meta.height : meta.width) ?? 0;
    const h0 = (swap ? meta.width : meta.height) ?? 0;
    if (Math.min(w0, h0) < MIN_SIDE) throw new ApiError(400, `Image trop petite (${MIN_SIDE} px au moins de chaque côté)`);
    if (Math.max(w0, h0) > MAX_SIDE || w0 * h0 > MAX_PIXELS) throw new ApiError(400, "Image trop grande (8000 px de côté et 40 millions de pixels au plus)");
    const widths = [...new Set([...VARIANT_WIDTHS.filter((w) => w < w0), Math.min(w0, VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1])])];
    const variants: ProcessedImage["variants"] = [];
    for (const w of widths) {
      // Pas de `withMetadata` : sharp retire EXIF, ICC et XMP.
      const out = await open().rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
      variants.push({ w: out.info.width, data: out.data, height: out.info.height });
    }
    const largest = variants[variants.length - 1];
    return { width: largest.w, height: largest.height, source: svg ? "svg" : (raster!.slice(6) as "jpeg" | "png" | "webp"), variants };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (/pixel limit/i.test(String((error as Error)?.message))) throw new ApiError(400, "Image trop grande (8000 px de côté et 40 millions de pixels au plus)");
    throw new ApiError(400, "L'image n'a pas pu être utilisée (fichier endommagé ou trop grand)");
  }
}

// ─── Dépôt en deux temps ─────────────────────────────────────────────────────

const cleanName = (name: string | undefined) => (name ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 120);
const cleanAlt = (alt: string) => {
  const value = alt.replace(/[\u0000-\u001f]/g, " ").trim();
  if (!value) throw new ApiError(400, "Le texte alternatif de l'image est obligatoire");
  if (value.length > 200) throw new ApiError(400, "Texte alternatif trop long (200 caractères au plus)");
  return value;
};

export interface StagedAsset {
  id: string;
  name: string;
  alt: string;
  mime: "image/webp";
  width: number;
  height: number;
  bytes: number;
  source: ProcessedImage["source"];
  variants: { w: number; bytes: number }[];
}

/** Traite et stocke l'image sous une ligne « en attente » (invisible, purgée si non confirmée). */
export async function stageAsset(siteId: string, buffer: Buffer, meta: { alt: string; name?: string }): Promise<StagedAsset> {
  const alt = cleanAlt(meta.alt);
  const name = cleanName(meta.name);
  const processed = await processImage(buffer);
  const prisma = await db();
  const site = await prisma.ticketingSite.findUniqueOrThrow({ where: { id: siteId }, select: { churchId: true, eventId: true } });
  const largest = processed.variants[processed.variants.length - 1];
  const asset = await prisma.ticketingSiteAsset.create({
    data: { siteId, key: "pending", width: processed.width, height: processed.height, bytes: largest.data.length, name, alt },
  });
  const base = `ticketing/${site.churchId}/${site.eventId}/site/${asset.id}`;
  const stored: StoredVariant[] = processed.variants.map((v, i) => ({ w: v.w, key: i === processed.variants.length - 1 ? `${base}.webp` : `${base}-${v.w}.webp`, bytes: v.data.length }));
  const { storeFile, deleteFile } = await import("@/lib/file-storage");
  try {
    for (const [i, v] of processed.variants.entries()) await storeFile(stored[i].key, v.data, "image/webp");
    await prisma.ticketingSiteAsset.update({ where: { id: asset.id }, data: { variants: stored as unknown as object } });
  } catch (error) {
    await Promise.all(stored.map((s) => deleteFile(s.key).catch(() => undefined)));
    await prisma.ticketingSiteAsset.delete({ where: { id: asset.id } }).catch(() => undefined);
    throw error;
  }
  return { id: asset.id, name, alt, mime: "image/webp", width: processed.width, height: processed.height, bytes: largest.data.length, source: processed.source, variants: stored.map(({ w, bytes }) => ({ w, bytes })) };
}

/** Finalise une image en attente de ce site ; refuse si elle a été purgée entre-temps. */
export async function confirmAsset(siteId: string, assetId: string, userId: string): Promise<{ id: string; width: number; height: number }> {
  const prisma = await db();
  const asset = await prisma.ticketingSiteAsset.findFirst({ where: { id: assetId, siteId, key: "pending" }, include: { site: { select: { churchId: true } } } });
  const variants = (asset?.variants ?? null) as StoredVariant[] | null;
  if (!asset || !variants?.length) throw new ApiError(409, "L'image en attente n'existe plus (purgée ou déjà confirmée)");
  await prisma.ticketingSiteAsset.update({ where: { id: assetId }, data: { key: variants[variants.length - 1].key } });
  const { logAudit } = await import("@/lib/audit");
  await logAudit({ userId, churchId: asset.site.churchId, action: "CREATE", entityType: "TicketingSiteAsset", entityId: assetId, details: { siteId, bytes: asset.bytes, name: asset.name } });
  return { id: asset.id, width: asset.width, height: asset.height };
}

/** Dépôt direct (écran de l'éditeur) : traitement puis confirmation immédiate. */
export async function uploadAsset(siteId: string, userId: string, buffer: Buffer, meta: { alt: string; name?: string }) {
  const staged = await stageAsset(siteId, buffer, meta);
  await confirmAsset(siteId, staged.id, userId);
  return { id: staged.id, width: staged.width, height: staged.height };
}

/** Existence et état d'une image du site (empreinte des aperçus MCP). */
export async function assetState(siteId: string, assetId: string): Promise<{ pending: boolean } | null> {
  const row = await (await db()).ticketingSiteAsset.findFirst({ where: { id: assetId, siteId }, select: { key: true } });
  return row && { pending: row.key === "pending" };
}

/** Images jamais confirmées depuis plus d'une heure : fichiers et lignes supprimés. */
export async function purgePendingAssets(now = new Date()): Promise<number> {
  const prisma = await db();
  const stale = await prisma.ticketingSiteAsset.findMany({ where: { key: "pending", createdAt: { lt: new Date(now.getTime() - PENDING_TTL_MS) } }, select: { id: true, variants: true } });
  if (!stale.length) return 0;
  const { deleteFile } = await import("@/lib/file-storage");
  for (const row of stale) {
    for (const v of (row.variants ?? []) as unknown as StoredVariant[]) await deleteFile(v.key).catch(() => undefined);
    await prisma.ticketingSiteAsset.deleteMany({ where: { id: row.id, key: "pending" } });
  }
  return stale.length;
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

const variantList = (value: unknown): StoredVariant[] => (Array.isArray(value) ? (value as StoredVariant[]).filter((v) => v && typeof v.w === "number" && typeof v.key === "string").sort((a, b) => a.w - b.w) : []);

/**
 * Lecture d'une image. Public (`publishedOnly`) : seulement si la version **publiée** d'un site
 * dont l'église a activé les sites la référence ; équipe : tout asset du site `siteId` demandé.
 * `width` : variante la plus proche par le haut (la plus grande à défaut) ; sans variante
 * (anciennes images), l'original.
 */
export async function readAsset(assetId: string, opts: { publishedOnly: true } | { publishedOnly: false; siteId: string }, width?: number) {
  const prisma = await db();
  const asset = await prisma.ticketingSiteAsset.findUnique({
    where: { id: assetId },
    include: { site: { select: { id: true, churchId: true, published: true, event: { select: { status: true } } } } },
  });
  if (!asset || asset.key === "pending") return null;
  if (opts.publishedOnly) {
    const { getSitesEnabled } = await import("./site-settings");
    if (!asset.site.published || asset.site.event.status === "DRAFT" || !(await getSitesEnabled(asset.site.churchId))) return null;
    const parsed = siteDocumentSchema.safeParse(asset.site.published);
    if (!parsed.success || !assetIdsOf(parsed.data).has(assetId)) return null;
  } else if (asset.site.id !== opts.siteId) return null;
  const variants = variantList(asset.variants);
  const key = width && variants.length ? (variants.find((v) => v.w >= width) ?? variants[variants.length - 1]).key : asset.key;
  const { readStoredFile } = await import("@/lib/file-storage");
  const buffer = await readStoredFile(key);
  return buffer ? { buffer } : null;
}

/**
 * Images référencées par un document dont un fichier manque dans le stockage (asset absent, en
 * attente, ou variante introuvable) : le public verrait une image cassée. Renvoie leurs noms.
 */
export async function missingAssetFiles(siteId: string, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await (await db()).ticketingSiteAsset.findMany({ where: { siteId, id: { in: [...ids] } }, select: { id: true, key: true, name: true, variants: true } });
  const { storedFileExists } = await import("@/lib/file-storage");
  const missing: string[] = [];
  for (const id of ids) {
    const row = rows.find((r) => r.id === id);
    if (!row || row.key === "pending") { missing.push(row?.name || id); continue; }
    const keys = new Set([row.key, ...variantList(row.variants).map((v) => v.key)]);
    const present = await Promise.all([...keys].map((k) => storedFileExists(k)));
    if (present.includes(false)) missing.push(row.name || id);
  }
  return missing;
}

export interface AssetView {
  id: string;
  name: string;
  alt: string;
  width: number;
  height: number;
  bytes: number;
  variants: { w: number; bytes: number }[];
  usedIn: { draft: string[]; published: string[] };
  createdAt: string;
}

async function documents(siteId: string) {
  const site = await (await db()).ticketingSite.findUniqueOrThrow({ where: { id: siteId }, select: { draft: true, published: true } });
  const parse = (v: unknown) => {
    const r = v ? siteDocumentSchema.safeParse(v) : null;
    return r?.success ? r.data : null;
  };
  return { draft: parse(site.draft), published: parse(site.published) };
}

/** Images confirmées du site, avec les emplacements du brouillon et de la version publiée qui les utilisent. */
export async function listAssets(siteId: string): Promise<AssetView[]> {
  const prisma = await db();
  const [rows, docs] = await Promise.all([
    prisma.ticketingSiteAsset.findMany({ where: { siteId, key: { not: "pending" } }, orderBy: { createdAt: "asc" } }),
    documents(siteId),
  ]);
  const where = (doc: typeof docs.draft, id: string) => (doc ? assetUsagesOf(doc).filter((u) => u.assetId === id).map((u) => u.where) : []);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    alt: r.alt,
    width: r.width,
    height: r.height,
    bytes: r.bytes,
    variants: variantList(r.variants).map(({ w, bytes }) => ({ w, bytes })),
    usedIn: { draft: where(docs.draft, r.id), published: where(docs.published, r.id) },
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Suppression refusée si l'image est utilisée par le brouillon ou par la version publiée. */
export async function deleteAsset(siteId: string, assetId: string, userId: string) {
  const prisma = await db();
  const asset = await prisma.ticketingSiteAsset.findFirst({ where: { id: assetId, siteId }, include: { site: { select: { churchId: true } } } });
  if (!asset) throw new ApiError(404, "Image introuvable");
  const docs = await documents(siteId);
  const used = [
    ...(docs.draft ? assetUsagesOf(docs.draft).filter((u) => u.assetId === assetId).map((u) => `brouillon › ${u.where}`) : []),
    ...(docs.published ? assetUsagesOf(docs.published).filter((u) => u.assetId === assetId).map((u) => `version publiée › ${u.where}`) : []),
  ];
  if (used.length) throw new ApiError(409, `Image utilisée, suppression refusée : ${used.join(" ; ")}`);
  const { deleteFile } = await import("@/lib/file-storage");
  await prisma.ticketingSiteAsset.delete({ where: { id: assetId } });
  const keys = new Set([asset.key, ...variantList(asset.variants).map((v) => v.key)]);
  for (const key of keys) if (key !== "pending") await deleteFile(key).catch(() => undefined);
  const { logAudit } = await import("@/lib/audit");
  await logAudit({ userId, churchId: asset.site.churchId, action: "DELETE", entityType: "TicketingSiteAsset", entityId: assetId });
}

// ─── Duplication, export et import ───────────────────────────────────────────

/** Copie les images confirmées d'un site vers un autre (fichiers compris) ; renvoie ancien → nouvel identifiant. */
export async function copyAssets(fromSiteId: string, toSiteId: string): Promise<Map<string, string>> {
  const prisma = await db();
  const [rows, target] = await Promise.all([
    prisma.ticketingSiteAsset.findMany({ where: { siteId: fromSiteId, key: { not: "pending" } }, orderBy: { createdAt: "asc" } }),
    prisma.ticketingSite.findUniqueOrThrow({ where: { id: toSiteId }, select: { churchId: true, eventId: true } }),
  ]);
  const { readStoredFile, storeFile } = await import("@/lib/file-storage");
  const map = new Map<string, string>();
  for (const row of rows) {
    const variants = variantList(row.variants);
    const files = variants.length ? variants : [{ w: row.width, key: row.key, bytes: row.bytes }];
    const created = await prisma.ticketingSiteAsset.create({ data: { siteId: toSiteId, key: "pending", width: row.width, height: row.height, bytes: row.bytes, name: row.name, alt: row.alt } });
    const base = `ticketing/${target.churchId}/${target.eventId}/site/${created.id}`;
    const copied: StoredVariant[] = [];
    for (const [i, file] of files.entries()) {
      const buffer = await readStoredFile(file.key);
      if (!buffer) continue;
      const key = i === files.length - 1 ? `${base}.webp` : `${base}-${file.w}.webp`;
      await storeFile(key, buffer, "image/webp");
      copied.push({ w: file.w, key, bytes: file.bytes });
    }
    if (!copied.length) {
      await prisma.ticketingSiteAsset.delete({ where: { id: created.id } });
      continue;
    }
    // La plus grande variante copiée porte la clé principale.
    const last = copied[copied.length - 1];
    await prisma.ticketingSiteAsset.update({ where: { id: created.id }, data: { key: last.key, variants: copied as unknown as object } });
    map.set(row.id, created.id);
  }
  return map;
}

/** Supprime fichiers et lignes des images d'un site (nettoyage d'une duplication ou d'un import interrompu). */
export async function discardSiteAssets(siteId: string): Promise<void> {
  const prisma = await db();
  const rows = await prisma.ticketingSiteAsset.findMany({ where: { siteId }, select: { id: true, key: true, variants: true } });
  const { deleteFile } = await import("@/lib/file-storage");
  for (const row of rows) for (const key of new Set([row.key, ...variantList(row.variants).map((v) => v.key)])) if (key !== "pending") await deleteFile(key).catch(() => undefined);
  await prisma.ticketingSiteAsset.deleteMany({ where: { siteId } });
}

export interface ExportedAsset {
  id: string;
  name: string;
  alt: string;
  mime: "image/webp";
  base64: string;
}

/** Images demandées, en WebP : variante de 1280 px au plus (la plus grande), l'original sinon. */
export async function exportAssets(siteId: string, ids: string[]): Promise<ExportedAsset[]> {
  if (!ids.length) return [];
  const rows = await (await db()).ticketingSiteAsset.findMany({ where: { siteId, id: { in: ids }, key: { not: "pending" } } });
  const { readStoredFile } = await import("@/lib/file-storage");
  const out: ExportedAsset[] = [];
  for (const row of rows) {
    const variants = variantList(row.variants);
    const key = (variants.filter((v) => v.w <= 1280).at(-1) ?? variants[0])?.key ?? row.key;
    const buffer = await readStoredFile(key);
    if (buffer) out.push({ id: row.id, name: row.name, alt: row.alt, mime: "image/webp", base64: buffer.toString("base64") });
  }
  return out;
}
