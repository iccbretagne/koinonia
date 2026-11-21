import { ApiError } from "@/lib/errors";
import { siteDocumentSchema, assetIdsOf } from "../site-schemas";
import { sniffImage } from "./events";

/**
 * Images d'un site d'événement (spec 084). Le fichier déposé n'est jamais servi tel quel : seul le
 * WebP réencodé (orientation appliquée, ≤ 2400 px, sans aucune métadonnée) est gardé.
 */

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_SIDE = 2400;
const MAX_INPUT_PIXELS = 40_000_000;

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

export async function uploadAsset(siteId: string, userId: string, buffer: Buffer) {
  if (buffer.length > MAX_BYTES) throw new ApiError(400, "Image trop lourde (8 Mo au plus)");
  if (!sniffImage(buffer)) throw new ApiError(400, "Format d'image non pris en charge (JPEG, PNG ou WebP)");
  const sharp = (await import("sharp")).default;
  let out: { data: Buffer; info: { width: number; height: number } };
  try {
    // Pas de `withMetadata` : sharp retire EXIF, ICC et XMP.
    out = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new ApiError(400, "L'image n'a pas pu être utilisée (fichier endommagé)");
  }
  const prisma = await db();
  const site = await prisma.ticketingSite.findUniqueOrThrow({ where: { id: siteId }, select: { churchId: true, eventId: true } });
  const asset = await prisma.ticketingSiteAsset.create({
    data: { siteId, key: "pending", width: out.info.width, height: out.info.height, bytes: out.data.length },
  });
  const key = `ticketing/${site.churchId}/${site.eventId}/site/${asset.id}.webp`;
  const { storeFile } = await import("@/lib/file-storage");
  try {
    await storeFile(key, out.data, "image/webp");
    await prisma.ticketingSiteAsset.update({ where: { id: asset.id }, data: { key } });
  } catch (error) {
    await prisma.ticketingSiteAsset.delete({ where: { id: asset.id } }).catch(() => undefined);
    throw error;
  }
  const { logAudit } = await import("@/lib/audit");
  await logAudit({ userId, churchId: site.churchId, action: "CREATE", entityType: "TicketingSiteAsset", entityId: asset.id, details: { siteId, bytes: out.data.length } });
  return { id: asset.id, width: out.info.width, height: out.info.height };
}

/**
 * Lecture d'une image. Public (`publishedOnly`) : seulement si la version **publiée** d'un site
 * dont l'église a activé les sites la référence ; équipe : tout asset du site `siteId` demandé.
 */
export async function readAsset(assetId: string, opts: { publishedOnly: true } | { publishedOnly: false; siteId: string }) {
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
  const { readStoredFile } = await import("@/lib/file-storage");
  const buffer = await readStoredFile(asset.key);
  return buffer ? { buffer } : null;
}

export async function deleteAsset(siteId: string, assetId: string, userId: string) {
  const prisma = await db();
  const asset = await prisma.ticketingSiteAsset.findFirst({ where: { id: assetId, siteId }, include: { site: { select: { churchId: true } } } });
  if (!asset) throw new ApiError(404, "Image introuvable");
  const { deleteFile } = await import("@/lib/file-storage");
  await prisma.ticketingSiteAsset.delete({ where: { id: assetId } });
  await deleteFile(asset.key).catch(() => undefined);
  const { logAudit } = await import("@/lib/audit");
  await logAudit({ userId, churchId: asset.site.churchId, action: "DELETE", entityType: "TicketingSiteAsset", entityId: assetId });
}
