import type { Prisma, AudioSource } from "@/generated/prisma/client";
import { ApiError } from "@/lib/errors";
import { assertServiceEditable } from "./service";
import {
  createMultipartUpload,
  getSignedPartUrl,
  completeMultipartUpload,
  listUploadedParts,
  abortMultipartUpload,
  deleteMediaFile,
} from "@/modules/storage";

type DbClient = Prisma.TransactionClient;

async function defaultDb(): Promise<DbClient> {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

/** Taille de part S3 — 8 Mo (minimum S3 : 5 Mo sauf dernière part). */
export const AUDIO_UPLOAD_PART_SIZE = 8 * 1024 * 1024;
const PART_URL_EXPIRY = 3600; // 1h — cohérent avec media/files/upload/sign

export function getAudioSourceKey(serviceId: string, sourceId: string, ext: string): string {
  return `audio-services/${serviceId}/sources/${sourceId}.${ext}`;
}

export function partCountFor(size: number, partSize = AUDIO_UPLOAD_PART_SIZE): number {
  return Math.max(1, Math.ceil(size / partSize));
}

export interface SignSequenceUploadInput {
  serviceId: string;
  churchId: string;
  filename: string;
  contentType: string;
  size: number;
}

/** `AudioSource` sans `sizeBytes` (BigInt — non sérialisable en JSON par `NextResponse.json`). */
export type JsonSafeAudioSource = Omit<AudioSource, "sizeBytes"> & { sizeBytes: number | null };

export function toJsonSafeAudioSource(source: AudioSource): JsonSafeAudioSource {
  return { ...source, sizeBytes: source.sizeBytes === null ? null : Number(source.sizeBytes) };
}

export interface SignedUpload {
  source: JsonSafeAudioSource;
  partUrls: string[]; // index 0 = partNumber 1
  expiresIn: number;
}

/**
 * Crée une `AudioSource(kind: SEQUENCE)` pour un fichier de séquence déposé et initie un
 * upload multipart S3. Renvoie une URL signée par part (le nombre de parts est déterministe
 * à partir de la taille annoncée) pour que le navigateur puisse envoyer chaque part
 * directement à S3, et reprendre après coupure sans redemander de nouvelles URLs pour les
 * parts déjà envoyées.
 */
export async function signSequenceUpload(input: SignSequenceUploadInput, db?: DbClient): Promise<SignedUpload> {
  db ??= await defaultDb();

  const service = await db.audioService.findUnique({ where: { id: input.serviceId } });
  if (!service || service.churchId !== input.churchId) {
    throw new ApiError(404, "Culte audio introuvable");
  }
  assertServiceEditable(service, "déposer de nouvelles séquences");

  const ext = input.filename.split(".").pop()?.toLowerCase() || "mp3";
  const source = await db.audioSource.create({
    data: {
      serviceId: input.serviceId,
      kind: "SEQUENCE",
      s3Key: "", // renseigné juste après (a besoin de l'id généré)
      originalFilename: input.filename,
      sizeBytes: BigInt(input.size),
      uploadStatus: "PENDING",
    },
  });

  // Le reste de la fonction ne doit jamais laisser une AudioSource orpheline (créée mais
  // inutilisable côté client) en cas d'échec — nettoyage best-effort avant de relayer l'erreur.
  try {
    const key = getAudioSourceKey(input.serviceId, source.id, ext);
    const uploadId = await createMultipartUpload(key, input.contentType);

    const updated = await db.audioSource.update({
      where: { id: source.id },
      data: { s3Key: key, uploadId },
    });

    const count = partCountFor(input.size);
    const partUrls = await Promise.all(
      Array.from({ length: count }, (_, i) => getSignedPartUrl(key, uploadId, i + 1, PART_URL_EXPIRY))
    );

    if (service.status === "DRAFT") {
      await db.audioService.update({ where: { id: service.id }, data: { status: "PENDING_REVIEW" } });
    }

    return { source: toJsonSafeAudioSource(updated), partUrls, expiresIn: PART_URL_EXPIRY };
  } catch (err) {
    await db.audioSource.delete({ where: { id: source.id } }).catch(() => {});
    throw err;
  }
}

/** Parts déjà reçues côté S3 pour une source en cours d'upload — reprise après coupure. */
export async function getUploadedParts(sourceId: string, churchId: string, db?: DbClient) {
  db ??= await defaultDb();
  const source = await db.audioSource.findUnique({ where: { id: sourceId }, include: { service: true } });
  if (!source || source.service.churchId !== churchId) {
    throw new ApiError(404, "Source audio introuvable");
  }
  if (!source.uploadId) {
    throw new ApiError(400, "Aucun upload multipart en cours pour cette source");
  }
  return listUploadedParts(source.s3Key, source.uploadId);
}

export interface CompleteSequenceUploadInput {
  serviceId: string;
  churchId: string;
  sourceId: string;
  parts: { partNumber: number; etag: string }[];
}

/**
 * Finalise l'upload multipart d'une séquence, marque la source prête et programme son
 * job `PROBE` (durée + niveau — pas de pics de forme d'onde en P1).
 */
export async function completeSequenceUpload(input: CompleteSequenceUploadInput, db?: DbClient): Promise<JsonSafeAudioSource> {
  db ??= await defaultDb();

  const source = await db.audioSource.findUnique({ where: { id: input.sourceId }, include: { service: true } });
  if (!source || source.service.churchId !== input.churchId || source.serviceId !== input.serviceId) {
    throw new ApiError(404, "Source audio introuvable");
  }
  if (!source.uploadId) {
    throw new ApiError(400, "Aucun upload multipart en cours pour cette source");
  }
  if (input.parts.length === 0) {
    throw new ApiError(400, "Aucune part fournie");
  }

  const etag = await completeMultipartUpload(source.s3Key, source.uploadId, input.parts);

  const [updated] = await db.$transaction([
    db.audioSource.update({ where: { id: source.id }, data: { uploadStatus: "DONE", etag } }),
    db.audioJob.create({ data: { serviceId: source.serviceId, type: "PROBE", status: "PENDING" } }),
  ]);

  return toJsonSafeAudioSource(updated);
}

/**
 * Supprime une séquence déposée par erreur (mauvais fichier, doublon…) tant que le culte
 * n'a pas quitté le dépôt (DRAFT/PENDING_REVIEW) — au-delà, un rendu ou une publication
 * pourrait déjà en dépendre. Retire aussi le `AudioSegment` nommé le cas échéant (contrainte
 * `sourceId` FK) et nettoie l'objet/upload S3 en best-effort (n'empêche pas la suppression
 * en base si S3 échoue — l'objet orphelin n'est pas grave, contrairement à un blocage UI).
 */
export async function deleteAudioSource(
  serviceId: string,
  churchId: string,
  sourceId: string,
  db?: DbClient
): Promise<void> {
  db ??= await defaultDb();

  const source = await db.audioSource.findUnique({
    where: { id: sourceId },
    include: { service: true, segment: true },
  });
  if (!source || source.serviceId !== serviceId || source.service.churchId !== churchId) {
    throw new ApiError(404, "Source audio introuvable");
  }
  assertServiceEditable(source.service, "supprimer une séquence");

  // Les jobs RENDER visant ce segment n'auraient plus de cible : les retirer évite qu'ils
  // continuent d'échouer en boucle (et de bloquer la sortie de READY) après la suppression.
  // Filtré par segmentId (dans le payload JSON), pas seulement par serviceId : une requête
  // large purgeait aussi les jobs PENDING d'autres séquences du même culte encore en cours de
  // rendu légitime, les laissant bloquées en READY sans rendu tant que « Publier » n'était pas
  // recliqué.
  const staleJobIds = source.segment
    ? (
        await db.audioJob.findMany({
          where: { serviceId: source.serviceId, type: "RENDER", status: { in: ["PENDING", "FAILED"] } },
          select: { id: true, payload: true },
        })
      )
        .filter((j) => (j.payload as { segmentId?: string } | null)?.segmentId === source.segment!.id)
        .map((j) => j.id)
    : [];

  await db.$transaction([
    ...(staleJobIds.length > 0 ? [db.audioJob.deleteMany({ where: { id: { in: staleJobIds } } })] : []),
    ...(source.segment ? [db.audioSegment.delete({ where: { id: source.segment.id } })] : []),
    db.audioSource.delete({ where: { id: source.id } }),
  ]);

  try {
    if (source.uploadId && source.uploadStatus !== "DONE") {
      await abortMultipartUpload(source.s3Key, source.uploadId);
    } else if (source.uploadStatus === "DONE" && source.s3Key) {
      await deleteMediaFile(source.s3Key);
    }
  } catch (err) {
    console.error("deleteAudioSource: échec du nettoyage S3 (non bloquant)", err);
  }
}
