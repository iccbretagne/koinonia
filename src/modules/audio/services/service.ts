import type { Prisma, AudioService } from "@/generated/prisma/client";
import { ApiError } from "@/lib/errors";
import { deleteMediaFile, abortMultipartUpload } from "@/modules/storage";

type DbClient = Prisma.TransactionClient;

async function defaultDb(): Promise<DbClient> {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

/**
 * Statuts dans lesquels la régie peut encore corriger le dépôt (redéposer, supprimer une
 * séquence, renommer/réordonner).
 *
 * `READY` en fait partie : un rendu peut échouer (fichier absent côté S3, ffmpeg en erreur) et
 * laisser le culte bloqué dans cet état sans jamais atteindre `PUBLISHED`. L'exclure créait une
 * impasse — ni correction, ni suppression, ni dépublication (qui exige `PUBLISHED`) n'étaient
 * possibles. `UNPUBLISHED` aussi : on dépublie précisément pour corriger avant de republier.
 * Seul `PUBLISHED` est verrouillé, le lien public étant actif.
 */
export const EDITABLE_SERVICE_STATUSES = ["DRAFT", "PENDING_REVIEW", "READY", "UNPUBLISHED"] as const;

export function assertServiceEditable(service: { status: string }, action: string): void {
  if (!(EDITABLE_SERVICE_STATUSES as readonly string[]).includes(service.status)) {
    throw new ApiError(400, `Ce culte est publié — dépubliez-le avant de ${action}.`);
  }
}

export interface CreateAudioServiceInput {
  churchId: string;
  planningEventId?: string | null;
  serviceDate?: Date;
  title?: string;
  speaker?: string;
  series?: string;
  type?: string;
}

/**
 * Crée un `AudioService` en DRAFT. Si `planningEventId` est fourni, vérifie qu'aucun
 * culte audio n'existe déjà pour cet événement (spec §1 cas limites — évite un doublon)
 * et que l'événement appartient bien à `churchId`. `serviceDate` est repris de
 * l'événement si non fourni ; obligatoire quand aucun événement n'est rattaché.
 *
 * `type` (nomenclature `@/lib/event-types`) est recopié depuis `Event.type` quand un
 * événement est rattaché — il écrase alors toute valeur saisie, le rattachement faisant
 * foi (spec 020 § scénario « enregistrer autre chose qu'un culte »). Sans rattachement,
 * la valeur saisie s'applique, ou `"AUTRE"` par défaut (défaut du schéma).
 */
export async function createAudioService(
  input: CreateAudioServiceInput,
  db?: DbClient
): Promise<AudioService> {
  db ??= await defaultDb();

  let eventDate: Date | null = null;
  let eventType: string | null = null;

  if (input.planningEventId) {
    const [existing, event] = await Promise.all([
      db.audioService.findUnique({ where: { planningEventId: input.planningEventId } }),
      db.event.findUnique({
        where: { id: input.planningEventId },
        select: { date: true, churchId: true, type: true },
      }),
    ]);
    if (existing) {
      throw new ApiError(409, "Un culte audio a déjà été déposé pour cet événement.");
    }
    if (!event) {
      throw new ApiError(404, "Événement introuvable");
    }
    if (event.churchId !== input.churchId) {
      throw new ApiError(400, "L'événement n'appartient pas à cette église");
    }
    eventDate = event.date;
    eventType = event.type;
  }

  const serviceDate = input.serviceDate ?? eventDate;
  if (!serviceDate) {
    throw new ApiError(400, "serviceDate est requis quand aucun événement n'est rattaché");
  }

  return db.audioService.create({
    data: {
      churchId: input.churchId,
      planningEventId: input.planningEventId ?? null,
      serviceDate,
      title: input.title,
      speaker: input.speaker,
      series: input.series,
      type: eventType ?? input.type,
      status: "DRAFT",
    },
  });
}

export interface UpdateAudioServiceInput {
  title?: string | null;
  speaker?: string;
  series?: string | null;
  serviceDate?: Date;
  planningEventId?: string | null;
  coverKey?: string | null;
  type?: string;
}

/**
 * Met à jour titre/orateur/date/rattachement événement/couverture/type. Le rattachement à un
 * événement peut être fait après publication sans redéposer ni republier (spec §1 cas limites).
 *
 * Comme à la création, `type` est re-dérivé depuis `Event.type` quand `planningEventId` est
 * fourni — un rattachement a posteriori écrase la saisie manuelle (spec 020).
 */
export async function updateAudioService(
  id: string,
  churchId: string,
  input: UpdateAudioServiceInput,
  db?: DbClient
): Promise<AudioService> {
  db ??= await defaultDb();

  const service = await db.audioService.findUnique({ where: { id } });
  if (!service || service.churchId !== churchId) {
    throw new ApiError(404, "Culte audio introuvable");
  }

  let eventType: string | undefined;

  if (input.planningEventId) {
    const [existing, event] = await Promise.all([
      db.audioService.findUnique({ where: { planningEventId: input.planningEventId } }),
      db.event.findUnique({ where: { id: input.planningEventId }, select: { churchId: true, type: true } }),
    ]);
    if (existing && existing.id !== id) {
      throw new ApiError(409, "Un culte audio a déjà été déposé pour cet événement.");
    }
    if (!event) {
      throw new ApiError(404, "Événement introuvable");
    }
    if (event.churchId !== churchId) {
      throw new ApiError(400, "L'événement n'appartient pas à cette église");
    }
    eventType = event.type;
  }

  return db.audioService.update({
    where: { id },
    data: {
      title: input.title,
      speaker: input.speaker,
      series: input.series,
      serviceDate: input.serviceDate,
      planningEventId: input.planningEventId,
      coverKey: input.coverKey,
      type: eventType ?? input.type,
    },
  });
}

/**
 * Supprime entièrement un culte audio (dépôt erroné, doublon, culte annulé…) — tant qu'il
 * n'est pas publié, le lien public n'ayant jamais été actif. Dépublier avant de supprimer un
 * culte publié.
 */
export async function deleteAudioService(id: string, churchId: string, db?: DbClient): Promise<void> {
  db ??= await defaultDb();

  const service = await db.audioService.findUnique({
    where: { id },
    include: { sources: true, segments: { include: { rendition: true } } },
  });
  if (!service || service.churchId !== churchId) {
    throw new ApiError(404, "Culte audio introuvable");
  }
  if (service.status === "PUBLISHED") {
    throw new ApiError(400, "Ce culte est publié — dépubliez-le avant de le supprimer.");
  }

  await db.$transaction([
    db.audioShareToken.deleteMany({ where: { serviceId: id } }),
    db.audioRendition.deleteMany({ where: { segment: { serviceId: id } } }),
    db.audioJob.deleteMany({ where: { serviceId: id } }),
    db.audioSegment.deleteMany({ where: { serviceId: id } }),
    db.audioSource.deleteMany({ where: { serviceId: id } }),
    db.audioService.delete({ where: { id } }),
  ]);

  // Nettoyage S3 non bloquant — la suppression en base est ce qui compte pour l'utilisateur ;
  // un objet orphelin sur le bucket n'empêche rien (même logique que deleteAudioSource).
  await Promise.allSettled([
    ...service.sources.map(async (s) => {
      try {
        if (s.uploadId && s.uploadStatus !== "DONE") {
          await abortMultipartUpload(s.s3Key, s.uploadId);
        } else if (s.uploadStatus === "DONE" && s.s3Key) {
          await deleteMediaFile(s.s3Key);
        }
      } catch (err) {
        console.error("deleteAudioService: échec du nettoyage S3 d'une source (non bloquant)", err);
      }
    }),
    ...service.segments
      .filter((seg) => seg.rendition)
      .map(async (seg) => {
        try {
          await deleteMediaFile(seg.rendition!.s3Key);
        } catch (err) {
          console.error("deleteAudioService: échec du nettoyage S3 d'un rendu (non bloquant)", err);
        }
      }),
  ]);
}
