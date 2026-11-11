import { prisma } from "@/lib/prisma";
import { getSignedThumbnailUrl } from "@/modules/storage";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Galerie médias (spec 080) : vue de lecture sur les médias validés de l'église, toutes
 * sources confondues. Photos `APPROVED` (date = date de l'événement) ; visuels `VISUAL`
 * `APPROVED`/`FINAL_APPROVED` — même définition que les partages — dans leur dernière
 * version (date = dépôt de cette version).
 *
 * Ordre total des éléments : (date, type, id). Les photos (volume élevé) sont paginées en
 * base ; les visuels (volume faible) sont lus en entier puis filtrés, faute de pouvoir trier
 * en base sur la date de la dernière version.
 */

export const GALLERY_PAGE_MAX = 60;
export const GALLERY_ZIP_MAX = 200;
const VISUAL_STATUSES = ["APPROVED", "FINAL_APPROVED"] as const;

export type GalleryKind = "photo" | "file";

export interface GalleryFilters {
  type: "all" | "photos" | "visuals";
  from?: Date;
  to?: Date;
  sourceType?: "event" | "project";
  sourceId?: string;
  q?: string;
  order: "desc" | "asc";
}

export interface GallerySource {
  type: "event" | "project";
  id: string;
  name: string;
}

export interface GalleryItem {
  kind: GalleryKind;
  id: string;
  filename: string;
  date: string;
  width: number | null;
  height: number | null;
  thumbnailUrl: string;
  source: GallerySource;
}

export interface GalleryPage {
  items: GalleryItem[];
  nextCursor: string | null;
  total: number;
}

interface Key {
  date: number;
  kind: GalleryKind;
  id: string;
}

export function encodeGalleryCursor(key: Key): string {
  return Buffer.from(`${key.date}|${key.kind}|${key.id}`).toString("base64url");
}

export function decodeGalleryCursor(cursor: string | undefined): Key | null {
  if (!cursor) return null;
  const [date, kind, id] = Buffer.from(cursor, "base64url").toString().split("|");
  const n = Number(date);
  if (!Number.isFinite(n) || (kind !== "photo" && kind !== "file") || !id) return null;
  return { date: n, kind, id };
}

/** Comparaison selon l'ordre total (date, type, id), croissant. */
function compareKeys(a: Key, b: Key): number {
  if (a.date !== b.date) return a.date - b.date;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** Filtre Prisma des photos situées après le curseur dans l'ordre demandé. */
function photoAfter(cursor: Key | null, order: "desc" | "asc"): Prisma.MediaPhotoWhereInput {
  if (!cursor) return {};
  const d = new Date(cursor.date);
  const before = order === "desc";
  const dateCmp = before ? { lt: d } : { gt: d };
  const idCmp = before ? { lt: cursor.id } : { gt: cursor.id };
  // Même date : « photo » se place après « file » (ordre alphabétique).
  const sameDate: Prisma.MediaPhotoWhereInput | null =
    cursor.kind === "photo"
      ? { mediaEvent: { date: d }, id: idCmp }
      : before
        ? null // en décroissant, après un visuel de même date il ne reste aucune photo de cette date
        : { mediaEvent: { date: d } };
  return { OR: [{ mediaEvent: { date: dateCmp } }, ...(sameDate ? [sameDate] : [])] };
}

function photoWhere(churchId: string, f: GalleryFilters): Prisma.MediaPhotoWhereInput {
  const dateRange = f.from || f.to ? { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } : undefined;
  return {
    status: "APPROVED",
    mediaEvent: {
      churchId,
      ...(dateRange ? { date: dateRange } : {}),
      ...(f.sourceType === "event" && f.sourceId ? { id: f.sourceId } : {}),
    },
    ...(f.q ? { OR: [{ filename: { contains: f.q } }, { mediaEvent: { name: { contains: f.q } } }] } : {}),
  };
}

interface VisualRow {
  key: Key;
  filename: string;
  width: number | null;
  height: number | null;
  thumbnailKey: string;
  source: GallerySource;
}

/** Tous les visuels validés de l'église correspondant aux filtres, triés croissant. */
async function loadVisuals(churchId: string, f: GalleryFilters): Promise<VisualRow[]> {
  if (f.type === "photos") return [];
  const sourceFilter =
    f.sourceType === "project" && f.sourceId
      ? { mediaProjectId: f.sourceId, mediaProject: { churchId } }
      : f.sourceType === "event" && f.sourceId
        ? { mediaEventId: f.sourceId, mediaEvent: { churchId } }
        : { OR: [{ mediaProject: { churchId } }, { mediaEvent: { churchId } }] };
  const files = await prisma.mediaFile.findMany({
    where: { type: "VISUAL", status: { in: [...VISUAL_STATUSES] }, ...sourceFilter },
    select: {
      id: true,
      filename: true,
      width: true,
      height: true,
      mediaProject: { select: { id: true, name: true } },
      mediaEvent: { select: { id: true, name: true } },
      versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { createdAt: true, thumbnailKey: true } },
    },
  });
  const q = f.q?.toLocaleLowerCase("fr");
  const rows: VisualRow[] = [];
  for (const file of files) {
    const version = file.versions[0];
    const container = file.mediaProject ?? file.mediaEvent;
    if (!version || !container) continue;
    const date = version.createdAt;
    if (f.from && date < f.from) continue;
    if (f.to && date > f.to) continue;
    if (q && !file.filename.toLocaleLowerCase("fr").includes(q) && !container.name.toLocaleLowerCase("fr").includes(q)) continue;
    rows.push({
      key: { date: date.getTime(), kind: "file", id: file.id },
      filename: file.filename,
      width: file.width,
      height: file.height,
      thumbnailKey: version.thumbnailKey,
      source: { type: file.mediaProject ? "project" : "event", id: container.id, name: container.name },
    });
  }
  rows.sort((a, b) => compareKeys(a.key, b.key));
  return rows;
}

/** Une page de la galerie : fusion des photos (paginées en base) et des visuels. */
export async function listLibraryItems(
  churchId: string,
  filters: GalleryFilters,
  cursor: string | undefined,
  limit: number = GALLERY_PAGE_MAX
): Promise<GalleryPage> {
  const take = Math.min(Math.max(limit, 1), GALLERY_PAGE_MAX);
  const after = decodeGalleryCursor(cursor);
  const desc = filters.order === "desc";
  const wantPhotos = filters.type !== "visuals" && filters.sourceType !== "project";

  const basePhotoWhere = photoWhere(churchId, filters);
  const [photos, photoTotal, visuals] = await Promise.all([
    wantPhotos
      ? prisma.mediaPhoto.findMany({
          where: { AND: [basePhotoWhere, photoAfter(after, filters.order)] },
          orderBy: [{ mediaEvent: { date: filters.order } }, { id: filters.order }],
          take: take + 1,
          select: {
            id: true,
            filename: true,
            width: true,
            height: true,
            thumbnailKey: true,
            mediaEvent: { select: { id: true, name: true, date: true } },
          },
        })
      : Promise.resolve([]),
    wantPhotos ? prisma.mediaPhoto.count({ where: basePhotoWhere }) : Promise.resolve(0),
    loadVisuals(churchId, filters),
  ]);

  const visualsOrdered = desc ? [...visuals].reverse() : visuals;
  const visualsAfter = after
    ? visualsOrdered.filter((v) => (desc ? compareKeys(v.key, after) < 0 : compareKeys(v.key, after) > 0))
    : visualsOrdered;

  type Row = { key: Key; filename: string; width: number | null; height: number | null; thumbnailKey: string; source: GallerySource };
  const photoRows: Row[] = photos.map((p) => ({
    key: { date: p.mediaEvent.date.getTime(), kind: "photo", id: p.id },
    filename: p.filename,
    width: p.width,
    height: p.height,
    thumbnailKey: p.thumbnailKey,
    source: { type: "event", id: p.mediaEvent.id, name: p.mediaEvent.name },
  }));
  const merged = [...photoRows, ...visualsAfter.slice(0, take + 1)].sort((a, b) =>
    desc ? compareKeys(b.key, a.key) : compareKeys(a.key, b.key)
  );
  const page = merged.slice(0, take);
  const hasMore = merged.length > take;

  const items = await Promise.all(
    page.map(async (r) => ({
      kind: r.key.kind,
      id: r.key.id,
      filename: r.filename,
      date: new Date(r.key.date).toISOString(),
      width: r.width,
      height: r.height,
      thumbnailUrl: r.thumbnailKey ? await getSignedThumbnailUrl(r.thumbnailKey) : "",
      source: r.source,
    }))
  );

  return {
    items,
    nextCursor: hasMore && page.length > 0 ? encodeGalleryCursor(page[page.length - 1].key) : null,
    total: photoTotal + visuals.length,
  };
}

/** Événements et projets ayant au moins un média validé (filtre « Événement ou projet »). */
export async function listLibrarySources(churchId: string, q?: string): Promise<GallerySource[]> {
  const nameFilter = q ? { name: { contains: q } } : {};
  const approvedVisual = { type: "VISUAL" as const, status: { in: [...VISUAL_STATUSES] } };
  const [events, projects] = await Promise.all([
    prisma.mediaEvent.findMany({
      where: {
        churchId,
        ...nameFilter,
        OR: [{ photos: { some: { status: "APPROVED" } } }, { files: { some: approvedVisual } }],
      },
      orderBy: { date: "desc" },
      take: 50,
      select: { id: true, name: true },
    }),
    prisma.mediaProject.findMany({
      where: { churchId, ...nameFilter, files: { some: approvedVisual } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, name: true },
    }),
  ]);
  return [
    ...events.map((e) => ({ type: "event" as const, id: e.id, name: e.name })),
    ...projects.map((p) => ({ type: "project" as const, id: p.id, name: p.name })),
  ];
}

export interface LibraryOriginal {
  originalKey: string;
  filename: string;
  folder: string;
}

const safeFolderName = (name: string) => name.replace(/[^a-z0-9\-_]/gi, "_").slice(0, 50);

/**
 * Originaux HD d'une sélection, revérifiés (église, statut validé) : un identifiant d'une autre
 * église ou d'un média non validé est ignoré.
 */
export async function resolveLibraryOriginals(
  churchId: string,
  photoIds: string[],
  fileIds: string[]
): Promise<LibraryOriginal[]> {
  const [photos, files] = await Promise.all([
    photoIds.length
      ? prisma.mediaPhoto.findMany({
          where: { id: { in: photoIds }, status: "APPROVED", mediaEvent: { churchId } },
          select: { filename: true, originalKey: true, mediaEvent: { select: { name: true } } },
        })
      : Promise.resolve([]),
    fileIds.length
      ? prisma.mediaFile.findMany({
          where: {
            id: { in: fileIds },
            type: "VISUAL",
            status: { in: [...VISUAL_STATUSES] },
            OR: [{ mediaProject: { churchId } }, { mediaEvent: { churchId } }],
          },
          select: {
            filename: true,
            mediaProject: { select: { name: true } },
            mediaEvent: { select: { name: true } },
            versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { originalKey: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  return [
    ...photos.map((p) => ({ originalKey: p.originalKey, filename: p.filename, folder: safeFolderName(p.mediaEvent.name) })),
    ...files.flatMap((f) => {
      const key = f.versions[0]?.originalKey;
      const name = (f.mediaProject ?? f.mediaEvent)?.name ?? "visuels";
      return key ? [{ originalKey: key, filename: f.filename, folder: safeFolderName(name) }] : [];
    }),
  ];
}
