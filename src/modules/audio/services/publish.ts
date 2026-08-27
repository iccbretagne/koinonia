import { createHash } from "crypto";
import type { Prisma, AudioService } from "@/generated/prisma/client";
import { ApiError } from "@/lib/errors";

type DbClient = Prisma.TransactionClient;

async function defaultDb(): Promise<DbClient> {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

/**
 * `sourceHash` d'un segment né du dépôt de séquences (P1) : hash de l'ETag S3 de
 * l'`AudioSource`. Redéposer un fichier de séquence corrigé change l'ETag et déclenche le
 * rendu de cette seule séquence ; republier sans redéposer ne re-rend rien (D10).
 */
export function computeSourceHash(etag: string | null): string {
  return createHash("sha256").update(etag ?? "").digest("hex");
}

/**
 * Transition READY/PUBLISHED : génère un `AudioJob(type: RENDER)` pour chaque segment
 * `SEQUENCE` dont le `sourceHash` a changé depuis le dernier rendu (idempotence). Si aucun
 * segment n'a changé (republication sans nouveau dépôt), passe directement à `PUBLISHED`
 * sans créer de job — le passage `READY` → `PUBLISHED` au dernier rendu est géré par le
 * worker (`handlers/render.ts`) dans le cas général.
 */
export async function publishAudioService(
  serviceId: string,
  churchId: string,
  publishedById: string,
  db?: DbClient
): Promise<AudioService> {
  db ??= await defaultDb();

  const service = await db.audioService.findUnique({
    where: { id: serviceId },
    include: {
      segments: {
        where: { kind: "SEQUENCE" },
        include: { source: true, rendition: true },
      },
    },
  });
  if (!service || service.churchId !== churchId) {
    throw new ApiError(404, "Culte audio introuvable");
  }
  if (service.segments.length === 0) {
    throw new ApiError(400, "Aucune séquence à publier — nommez au moins une séquence.");
  }

  // Une source dont le multipart n'a jamais abouti n'a pas d'objet S3 : le job RENDER
  // échouerait sur « The specified key does not exist », épuiserait ses tentatives, et le
  // culte resterait indéfiniment en READY sans jamais atteindre PUBLISHED. On refuse ici
  // plutôt que de laisser le worker buter dessus.
  const incomplete = service.segments.filter(
    (segment) => segment.source && segment.source.uploadStatus !== "DONE"
  );
  if (incomplete.length > 0) {
    const noms = incomplete.map((s) => s.title).join(", ");
    throw new ApiError(
      400,
      `Dépôt incomplet pour : ${noms}. Redéposez ces fichiers ou supprimez-les avant de publier.`
    );
  }

  const jobsToCreate: Prisma.AudioJobCreateManyInput[] = [];
  for (const segment of service.segments) {
    const hash = computeSourceHash(segment.source?.etag ?? null);
    if (segment.rendition?.sourceHash === hash) continue; // déjà rendu à jour, idempotent
    jobsToCreate.push({
      serviceId,
      type: "RENDER",
      status: "PENDING",
      payload: { segmentId: segment.id, sourceHash: hash },
    });
  }

  const nowReady = jobsToCreate.length === 0; // rien à re-rendre : publication immédiate

  await db.$transaction([
    ...(jobsToCreate.length > 0 ? [db.audioJob.createMany({ data: jobsToCreate })] : []),
    db.audioService.update({
      where: { id: serviceId },
      data: {
        status: nowReady ? "PUBLISHED" : "READY",
        publishedAt: service.publishedAt ?? new Date(),
        publishedById,
      },
    }),
  ]);

  return db.audioService.findUniqueOrThrow({ where: { id: serviceId } });
}

/** Dépublie un culte : les liens déjà partagés deviennent inopérants (spec §3 cas limites). */
export async function unpublishAudioService(
  serviceId: string,
  churchId: string,
  db?: DbClient
): Promise<AudioService> {
  db ??= await defaultDb();

  const service = await db.audioService.findUnique({ where: { id: serviceId } });
  if (!service || service.churchId !== churchId) {
    throw new ApiError(404, "Culte audio introuvable");
  }
  if (service.status !== "PUBLISHED") {
    throw new ApiError(400, "Ce culte n'est pas publié");
  }

  return db.audioService.update({ where: { id: serviceId }, data: { status: "UNPUBLISHED" } });
}

export interface PublicationCompletion {
  /** Le culte vient-il de passer `READY` → `PUBLISHED` ? */
  published: boolean;
  /** Séquences dont le rendu manque encore (0 si le culte n'était pas en attente de rendu). */
  remaining: number;
}

/**
 * Appelé par le worker après l'écriture d'une `AudioRendition` : si tous les segments
 * `SEQUENCE` du culte ont désormais une rendition à jour, passe `READY` → `PUBLISHED`.
 *
 * Renvoie l'état constaté pour que l'appelant puisse le journaliser — « publié » ou « il reste
 * N séquences » est l'information qu'on cherche quand une publication semble ne pas aboutir.
 * La fonction reste muette elle-même : elle s'exécute aussi dans le process Next.js.
 */
export async function maybeCompletePublication(
  serviceId: string,
  db?: DbClient
): Promise<PublicationCompletion> {
  db ??= await defaultDb();

  const service = await db.audioService.findUnique({
    where: { id: serviceId },
    include: {
      segments: {
        where: { kind: "SEQUENCE" },
        include: { source: true, rendition: true },
      },
    },
  });
  if (!service || service.status !== "READY") return { published: false, remaining: 0 };

  const remaining = service.segments.filter(
    (segment) => segment.rendition?.sourceHash !== computeSourceHash(segment.source?.etag ?? null)
  ).length;
  if (remaining > 0) return { published: false, remaining };

  await db.audioService.update({ where: { id: serviceId }, data: { status: "PUBLISHED" } });
  return { published: true, remaining: 0 };
}
