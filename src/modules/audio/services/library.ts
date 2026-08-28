/**
 * Bibliothèque d'écoute des cultes (spec 021) — lecture métier réservée aux cultes publiés de
 * l'église courante. `status: "PUBLISHED"` est systématiquement forcé : un culte dépublié
 * disparaît de la liste à l'instant de la consultation, sans cache applicatif.
 */
import type { Prisma } from "@/generated/prisma/client";
import { mapPublishedSegments, resolveEffectiveCoverUrl, type PublicAudioService } from "./public";

type DbClient = Prisma.TransactionClient;

async function defaultDb(): Promise<DbClient> {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

export type LibrarySort = "recent" | "oldest" | "speaker";

export interface ListPublishedServicesInput {
  churchId: string;
  q?: string;
  speaker?: string;
  type?: string;
  series?: string;
  from?: Date;
  to?: Date;
  sort?: LibrarySort;
}

export interface LibraryServiceSummary {
  id: string;
  title: string | null;
  serviceDate: Date;
  speaker: string | null;
  series: string | null;
  type: string;
  segmentCount: number;
  totalDurationMs: number;
  // IDs des séquences rendues — permet au bandeau « Reprendre l'écoute » (localStorage, indexé
  // par ID de séquence) de retrouver le culte correspondant sans requête supplémentaire.
  segmentIds: string[];
}

function buildOrderBy(sort: LibrarySort | undefined): Prisma.AudioServiceOrderByWithRelationInput {
  switch (sort) {
    case "oldest":
      return { serviceDate: "asc" };
    case "speaker":
      return { speaker: "asc" };
    case "recent":
    default:
      return { serviceDate: "desc" };
  }
}

/**
 * Liste les cultes publiés de l'église, filtrables par orateur, type, période et recherche
 * libre sur le titre — critères cumulables (spec 021, critère d'acceptation).
 */
export async function listPublishedServices(
  input: ListPublishedServicesInput,
  db?: DbClient
): Promise<LibraryServiceSummary[]> {
  db ??= await defaultDb();

  const where: Prisma.AudioServiceWhereInput = {
    churchId: input.churchId,
    status: "PUBLISHED",
    ...(input.speaker ? { speaker: input.speaker } : {}),
    ...(input.type ? { type: input.type } : {}),
    ...(input.series ? { series: input.series } : {}),
    ...(input.q ? { title: { contains: input.q } } : {}),
    ...(input.from || input.to
      ? {
          serviceDate: {
            ...(input.from ? { gte: input.from } : {}),
            ...(input.to ? { lte: input.to } : {}),
          },
        }
      : {}),
  };

  const services = await db.audioService.findMany({
    where,
    include: {
      segments: {
        where: { kind: "SEQUENCE" },
        include: { rendition: { select: { durationMs: true } } },
      },
    },
    orderBy: buildOrderBy(input.sort),
  });

  return services.map((s) => {
    const renderedSegments = s.segments.filter((seg) => seg.rendition);
    return {
      id: s.id,
      title: s.title,
      serviceDate: s.serviceDate,
      speaker: s.speaker,
      series: s.series,
      type: s.type,
      segmentCount: renderedSegments.length,
      totalDurationMs: renderedSegments.reduce((sum, seg) => sum + (seg.rendition?.durationMs ?? 0), 0),
      segmentIds: renderedSegments.map((seg) => seg.id),
    };
  });
}

/** Séries distinctes renseignées parmi les cultes publiés — pour le filtre « Série ». */
export async function listSeries(churchId: string, db?: DbClient): Promise<string[]> {
  db ??= await defaultDb();

  const rows = await db.audioService.findMany({
    where: { churchId, status: "PUBLISHED", series: { not: null } },
    select: { series: true },
    distinct: ["series"],
    orderBy: { series: "asc" },
  });

  return rows.map((r) => r.series).filter((s): s is string => s !== null);
}

/** Orateurs distincts renseignés parmi les cultes publiés — pour un choix plutôt qu'une saisie libre. */
export async function listSpeakers(churchId: string, db?: DbClient): Promise<string[]> {
  db ??= await defaultDb();

  const rows = await db.audioService.findMany({
    where: { churchId, status: "PUBLISHED", speaker: { not: null } },
    select: { speaker: true },
    distinct: ["speaker"],
    orderBy: { speaker: "asc" },
  });

  return rows.map((r) => r.speaker).filter((s): s is string => s !== null);
}

/**
 * Fiche d'écoute d'un culte publié pour un membre de l'église — mêmes champs que
 * `resolvePublicAudioService`, en réutilisant le même mapping de segments et la même
 * résolution de couverture : la bibliothèque et la page publique ne peuvent pas diverger.
 * `null` si le culte n'existe pas, n'est pas publié, ou n'appartient pas à cette église.
 */
export async function getPublishedServiceForMember(
  serviceId: string,
  churchId: string,
  db?: DbClient
): Promise<PublicAudioService | null> {
  db ??= await defaultDb();

  const service = await db.audioService.findUnique({
    where: { id: serviceId },
    include: {
      segments: {
        where: { kind: "SEQUENCE" },
        orderBy: { order: "asc" },
        include: { rendition: true },
      },
    },
  });

  if (!service || service.churchId !== churchId || service.status !== "PUBLISHED") return null;

  return {
    title: service.title,
    serviceDate: service.serviceDate,
    speaker: service.speaker,
    coverUrl: await resolveEffectiveCoverUrl(service.coverKey, service.churchId, db),
    planningEventId: service.planningEventId,
    segments: mapPublishedSegments(service.segments),
  };
}
