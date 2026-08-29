import type { AudioSegment, AudioRendition, Prisma } from "@/generated/prisma/client";
import { getSignedStreamUrl } from "@/modules/storage";
import { renditionVersion } from "./rendition-cache";

type DbClient = Prisma.TransactionClient;

async function defaultDb(): Promise<DbClient> {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

export interface PublicAudioSegment {
  id: string;
  title: string;
  order: number;
  durationMs: number;
  /** Empreinte du rendu — change quand le contenu change (spec 026), sert de casse-cache navigateur. */
  version: string;
}

export interface PublicAudioService {
  title: string | null;
  serviceDate: Date;
  speaker: string | null;
  coverUrl: string | null;
  planningEventId: string | null;
  segments: PublicAudioSegment[];
}

export type PublicAudioResolution =
  | { status: "NOT_FOUND" }
  | { status: "REVOKED" }
  | { status: "UNAVAILABLE" }
  | { status: "OK"; data: PublicAudioService };

/**
 * Mapping des segments rendus, partagé entre la page publique et la bibliothèque interne
 * (spec 021) — pour que les deux vues ne puissent pas diverger. Seuls les segments dont le
 * rendu est terminé sont exposés à l'écoute.
 */
export function mapPublishedSegments(
  segments: (AudioSegment & { rendition: AudioRendition | null })[]
): PublicAudioSegment[] {
  return segments
    .filter((s) => s.rendition)
    .map((s) => ({
      id: s.id,
      title: s.title,
      order: s.order,
      durationMs: s.rendition!.durationMs,
      version: renditionVersion(s.rendition!.sourceHash),
    }));
}

/**
 * Résout la couverture effective d'un culte — celle du culte si définie, sinon la couverture
 * par défaut de l'église. Partagé entre la page publique et la bibliothèque interne.
 */
export async function resolveEffectiveCoverUrl(
  coverKey: string | null,
  churchId: string,
  db: DbClient
): Promise<string | null> {
  const effectiveCoverKey =
    coverKey ??
    (
      await db.audioSettings.findUnique({
        where: { churchId },
        select: { defaultCoverKey: true },
      })
    )?.defaultCoverKey ??
    null;

  return effectiveCoverKey ? await getSignedStreamUrl(effectiveCoverKey) : null;
}

/**
 * Résout un token de partage public — distingue un token inexistant (404 générique) d'un lien
 * révoqué ou d'un culte dépublié (réponse dédiée, spec §3 « message compréhensible »).
 * Incrémente `openCount` une seule fois côté appelant HTTP — pas ici, pour rester un pur
 * lecteur réutilisable côté page ET côté route API sans effet de bord dupliqué.
 */
export async function resolvePublicAudioService(token: string, db?: DbClient): Promise<PublicAudioResolution> {
  db ??= await defaultDb();

  const shareToken = await db.audioShareToken.findUnique({ where: { token } });
  if (!shareToken) return { status: "NOT_FOUND" };
  if (shareToken.revokedAt) return { status: "REVOKED" };

  const service = await db.audioService.findUnique({
    where: { id: shareToken.serviceId },
    include: {
      segments: {
        where: shareToken.segmentId ? { id: shareToken.segmentId } : { kind: "SEQUENCE" },
        orderBy: { order: "asc" },
        include: { rendition: true },
      },
    },
  });
  if (!service) return { status: "NOT_FOUND" };
  if (service.status !== "PUBLISHED") return { status: "UNAVAILABLE" };

  return {
    status: "OK",
    data: {
      title: service.title,
      serviceDate: service.serviceDate,
      speaker: service.speaker,
      coverUrl: await resolveEffectiveCoverUrl(service.coverKey, service.churchId, db),
      planningEventId: service.planningEventId,
      segments: mapPublishedSegments(service.segments),
    },
  };
}

/** Incrémente le compteur d'ouverture — appelé une fois par résolution réussie (spec §6). */
export async function recordAudioServiceOpen(serviceId: string, db?: DbClient): Promise<void> {
  db ??= await defaultDb();
  await db.audioService.update({ where: { id: serviceId }, data: { openCount: { increment: 1 } } });
}
