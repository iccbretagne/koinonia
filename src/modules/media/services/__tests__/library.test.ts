/**
 * Tests — src/modules/media/services/library.ts (spec 080, galerie médias).
 * Photos paginées en base (le mock interprète le filtre de curseur), visuels en mémoire ;
 * fusion triée par (date, type, id) sans doublon ni trou d'une page à l'autre.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/modules/storage", () => ({
  getSignedThumbnailUrl: (key: string) => Promise.resolve(`signed://${key}`),
}));

const { listLibraryItems, listLibrarySources, resolveLibraryOriginals, encodeGalleryCursor, decodeGalleryCursor } = await import("../library");

type Cmp = { lt?: unknown; gt?: unknown };
interface PhotoRow {
  id: string;
  filename: string;
  width: number | null;
  height: number | null;
  thumbnailKey: string;
  mediaEvent: { id: string; name: string; date: Date };
}

const d = (s: string) => new Date(`${s}T10:00:00.000Z`);

function photo(id: string, date: string, event = "evt-1"): PhotoRow {
  return { id, filename: `${id}.jpg`, width: 10, height: 10, thumbnailKey: `t/${id}`, mediaEvent: { id: event, name: `Événement ${event}`, date: d(date) } };
}

function visual(id: string, date: string, project: string | null = "prj-1") {
  return {
    id,
    filename: `${id}.png`,
    width: 20,
    height: 20,
    mediaProject: project ? { id: project, name: `Projet ${project}` } : null,
    mediaEvent: project ? null : { id: "evt-v", name: "Événement visuel" },
    versions: [{ createdAt: d(date), thumbnailKey: `v/${id}` }],
  };
}

/** Interprète le filtre de curseur produit par `photoAfter` sur des lignes en mémoire. */
function matchAfter(row: PhotoRow, after: { OR?: Record<string, unknown>[] }): boolean {
  if (!after.OR) return true;
  return after.OR.some((cond) => {
    const ev = cond.mediaEvent as { date: Date | Cmp };
    const t = row.mediaEvent.date.getTime();
    if (ev.date instanceof Date) {
      if (t !== ev.date.getTime()) return false;
      const id = cond.id as Cmp | undefined;
      if (!id) return true;
      return id.lt !== undefined ? row.id < (id.lt as string) : row.id > (id.gt as string);
    }
    const cmp = ev.date as Cmp;
    return cmp.lt !== undefined ? t < (cmp.lt as Date).getTime() : t > (cmp.gt as Date).getTime();
  });
}

function withPhotos(rows: PhotoRow[]) {
  prismaMock.mediaPhoto.findMany.mockImplementation(async (args: { where: { AND: [unknown, { OR?: Record<string, unknown>[] }] }; orderBy: { mediaEvent?: { date: "asc" | "desc" } }[]; take: number }) => {
    const order = args.orderBy[0].mediaEvent?.date ?? "desc";
    const sign = order === "desc" ? -1 : 1;
    return rows
      .filter((r) => matchAfter(r, args.where.AND[1]))
      .sort((a, b) => sign * (a.mediaEvent.date.getTime() - b.mediaEvent.date.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)))
      .slice(0, args.take);
  });
  prismaMock.mediaPhoto.count.mockResolvedValue(rows.length);
}

const ALL = { type: "all" as const, order: "desc" as const };

beforeEach(() => {
  vi.clearAllMocks();
  withPhotos([]);
  prismaMock.mediaFile.findMany.mockResolvedValue([]);
});

describe("listLibraryItems — filtres et statuts", () => {
  it("photos APPROVED de l'église, visuels VISUAL validés de l'église", async () => {
    await listLibraryItems("church-1", ALL, undefined);
    const photoWhere = prismaMock.mediaPhoto.count.mock.calls[0][0].where;
    expect(photoWhere).toMatchObject({ status: "APPROVED", mediaEvent: { churchId: "church-1" } });
    const fileWhere = prismaMock.mediaFile.findMany.mock.calls[0][0].where;
    expect(fileWhere).toMatchObject({ type: "VISUAL", status: { in: ["APPROVED", "FINAL_APPROVED"] } });
    expect(fileWhere.OR).toEqual([{ mediaProject: { churchId: "church-1" } }, { mediaEvent: { churchId: "church-1" } }]);
  });

  it("type Photos : aucun visuel lu ; type Visuels : aucune photo lue", async () => {
    await listLibraryItems("church-1", { ...ALL, type: "photos" }, undefined);
    expect(prismaMock.mediaFile.findMany).not.toHaveBeenCalled();
    vi.clearAllMocks();
    withPhotos([]);
    prismaMock.mediaFile.findMany.mockResolvedValue([]);
    await listLibraryItems("church-1", { ...ALL, type: "visuals" }, undefined);
    expect(prismaMock.mediaPhoto.findMany).not.toHaveBeenCalled();
  });

  it("filtre de source projet : pas de photo, visuels du projet seulement", async () => {
    await listLibraryItems("church-1", { ...ALL, sourceType: "project", sourceId: "prj-9" }, undefined);
    expect(prismaMock.mediaPhoto.findMany).not.toHaveBeenCalled();
    expect(prismaMock.mediaFile.findMany.mock.calls[0][0].where).toMatchObject({ mediaProjectId: "prj-9", mediaProject: { churchId: "church-1" } });
  });

  it("période et recherche appliquées aux photos (date d'événement) et aux visuels (date de dépôt)", async () => {
    prismaMock.mediaFile.findMany.mockResolvedValue([visual("v-in", "2026-03-10"), visual("v-out", "2026-05-01"), visual("autre", "2026-03-12")]);
    const from = new Date("2026-03-01T00:00:00Z");
    const to = new Date("2026-03-31T23:59:59Z");
    const page = await listLibraryItems("church-1", { ...ALL, from, to, q: "v-" }, undefined);
    expect(prismaMock.mediaPhoto.count.mock.calls[0][0].where.mediaEvent.date).toEqual({ gte: from, lte: to });
    expect(prismaMock.mediaPhoto.count.mock.calls[0][0].where.OR).toBeDefined();
    expect(page.items.map((i) => i.id)).toEqual(["v-in"]);
  });

  it("visuel : dernière version (vignette et date de dépôt) et origine", async () => {
    prismaMock.mediaFile.findMany.mockResolvedValue([visual("v1", "2026-04-02", null)]);
    const { items } = await listLibraryItems("church-1", ALL, undefined);
    expect(items[0]).toMatchObject({
      kind: "file",
      date: d("2026-04-02").toISOString(),
      thumbnailUrl: "signed://v/v1",
      source: { type: "event", id: "evt-v" },
    });
    expect(prismaMock.mediaFile.findMany.mock.calls[0][0].select.versions).toMatchObject({ orderBy: { versionNumber: "desc" }, take: 1 });
  });
});

describe("listLibraryItems — fusion et curseur", () => {
  const photos = [
    photo("p1", "2026-01-05"), photo("p2", "2026-01-05"), photo("p3", "2026-02-10"),
    photo("p4", "2026-03-15"), photo("p5", "2026-03-15"), photo("p6", "2026-04-20"),
  ];
  const visuals = [visual("f1", "2026-01-05"), visual("f2", "2026-03-15"), visual("f3", "2026-05-01")];

  async function walk(order: "desc" | "asc") {
    withPhotos(photos);
    prismaMock.mediaFile.findMany.mockResolvedValue(visuals);
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await listLibraryItems("church-1", { ...ALL, order }, cursor, 3);
      seen.push(...page.items.map((i) => `${i.kind}:${i.id}`));
      cursor = page.nextCursor ?? undefined;
      expect(page.total).toBe(9);
      pages++;
    } while (cursor && pages < 10);
    return { seen, pages };
  }

  it("décroissant : 3 pages, ordre (date, type, id) inverse, sans doublon ni trou", async () => {
    const { seen, pages } = await walk("desc");
    expect(pages).toBe(3);
    expect(seen).toEqual([
      "file:f3", "photo:p6", "photo:p5", "photo:p4", "file:f2", "photo:p3", "photo:p2", "photo:p1", "file:f1",
    ]);
  });

  it("croissant : même ensemble dans l'ordre inverse", async () => {
    const { seen } = await walk("asc");
    expect(seen).toEqual([
      "file:f1", "photo:p1", "photo:p2", "photo:p3", "file:f2", "photo:p4", "photo:p5", "photo:p6", "file:f3",
    ]);
  });

  it("curseur : aller-retour et rejet d'un curseur invalide", () => {
    const key = { date: 1700000000000, kind: "photo" as const, id: "abc" };
    expect(decodeGalleryCursor(encodeGalleryCursor(key))).toEqual(key);
    expect(decodeGalleryCursor("n'importe-quoi")).toBeNull();
    expect(decodeGalleryCursor(undefined)).toBeNull();
  });
});

describe("listLibrarySources et resolveLibraryOriginals", () => {
  it("sources : événements et projets de l'église ayant un média validé", async () => {
    prismaMock.mediaEvent.findMany.mockResolvedValue([{ id: "e1", name: "Baptêmes" }]);
    prismaMock.mediaProject.findMany.mockResolvedValue([{ id: "p1", name: "Affiches" }]);
    const sources = await listLibrarySources("church-1", "Ba");
    expect(sources).toEqual([
      { type: "event", id: "e1", name: "Baptêmes" },
      { type: "project", id: "p1", name: "Affiches" },
    ]);
    expect(prismaMock.mediaEvent.findMany.mock.calls[0][0].where).toMatchObject({ churchId: "church-1", name: { contains: "Ba" } });
  });

  it("originaux : revérifie l'église et le statut, dernière version d'un visuel", async () => {
    prismaMock.mediaPhoto.findMany.mockResolvedValue([{ filename: "a.jpg", originalKey: "o/a", mediaEvent: { name: "Culte du 5" } }]);
    prismaMock.mediaFile.findMany.mockResolvedValue([
      { filename: "b.png", mediaProject: { name: "Affiche" }, mediaEvent: null, versions: [{ originalKey: "o/b2" }] },
      { filename: "sans-version.png", mediaProject: { name: "X" }, mediaEvent: null, versions: [] },
    ]);
    const out = await resolveLibraryOriginals("church-1", ["a"], ["b", "c"]);
    expect(prismaMock.mediaPhoto.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["a"] }, status: "APPROVED", mediaEvent: { churchId: "church-1" } });
    expect(prismaMock.mediaFile.findMany.mock.calls[0][0].where).toMatchObject({ id: { in: ["b", "c"] }, status: { in: ["APPROVED", "FINAL_APPROVED"] } });
    expect(out).toEqual([
      { originalKey: "o/a", filename: "a.jpg", folder: "Culte_du_5" },
      { originalKey: "o/b2", filename: "b.png", folder: "Affiche" },
    ]);
  });

  it("aucune sélection : aucune requête", async () => {
    expect(await resolveLibraryOriginals("church-1", [], [])).toEqual([]);
    expect(prismaMock.mediaPhoto.findMany).not.toHaveBeenCalled();
  });
});
