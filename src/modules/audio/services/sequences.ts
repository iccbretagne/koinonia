import type { Prisma, AudioSegment, AudioSegmentKind } from "@/generated/prisma/client";
import { ApiError } from "@/lib/errors";
import { assertServiceEditable } from "./service";

type DbClient = Prisma.TransactionClient;

async function defaultDb(): Promise<DbClient> {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

export interface SequenceInput {
  sourceId: string;
  order: number;
  title: string;
  kind?: AudioSegmentKind;
}

/**
 * Validation pure (fonction pure et testable en CI) : unicité de `order`, unicité et
 * non-vacuité du titre. Pas de logique de frontières — chemin séquences déjà découpées (P1).
 */
export function validateSequences(sequences: SequenceInput[]): void {
  const orders = new Set<number>();
  const titles = new Set<string>();

  for (const seq of sequences) {
    if (!seq.title.trim()) {
      throw new ApiError(400, "Le titre d'une séquence ne peut pas être vide");
    }
    if (orders.has(seq.order)) {
      throw new ApiError(400, `Deux séquences partagent le même ordre (${seq.order})`);
    }
    orders.add(seq.order);

    const normalizedTitle = seq.title.trim().toLowerCase();
    if (titles.has(normalizedTitle)) {
      throw new ApiError(400, `Deux séquences portent le même titre ("${seq.title.trim()}")`);
    }
    titles.add(normalizedTitle);
  }
}

/**
 * Crée/réordonne un `AudioSegment` par `AudioSource(kind: SEQUENCE)` fourni
 * (`sourceId` renseigné, `startMs=0`, `endMs=durationMs` de la source). Le réordonnancement
 * passe par une phase intermédiaire à des valeurs négatives disjointes pour ne jamais violer
 * `@@unique([serviceId, order])` en cas d'échange d'ordres (ex. 1 ↔ 2).
 */
export async function applySequences(
  serviceId: string,
  churchId: string,
  sequences: SequenceInput[],
  db?: DbClient
): Promise<AudioSegment[]> {
  validateSequences(sequences);
  db ??= await defaultDb();

  const service = await db.audioService.findUnique({ where: { id: serviceId } });
  if (!service || service.churchId !== churchId) {
    throw new ApiError(404, "Culte audio introuvable");
  }
  assertServiceEditable(service, "modifier les séquences");

  const sourceIds = sequences.map((s) => s.sourceId);
  const sources = await db.audioSource.findMany({
    where: { id: { in: sourceIds }, serviceId, kind: "SEQUENCE" },
  });
  if (sources.length !== new Set(sourceIds).size) {
    throw new ApiError(400, "Une ou plusieurs sources sont invalides pour ce culte");
  }
  const sourceById = new Map(sources.map((s) => [s.id, s]));

  const existing = await db.audioSegment.findMany({
    where: { serviceId, sourceId: { in: sourceIds } },
  });
  const existingBySource = new Map(existing.map((seg) => [seg.sourceId as string, seg]));

  await db.$transaction([
    // Phase 1 : décale les segments existants sur des ordres temporaires négatifs et
    // disjoints — évite toute collision avec @@unique([serviceId, order]) pendant un
    // réordonnancement (ex. échanger l'ordre 1 et 2).
    ...existing.map((seg, i) =>
      db.audioSegment.update({ where: { id: seg.id }, data: { order: -(i + 1) } })
    ),
    // Phase 2 : pose les valeurs finales (met à jour un segment existant ou en crée un nouveau).
    ...sequences.map((seq) => {
      const source = sourceById.get(seq.sourceId)!;
      const current = existingBySource.get(seq.sourceId);
      const data = {
        order: seq.order,
        title: seq.title.trim(),
        kind: seq.kind ?? ("SEQUENCE" as const),
        endMs: source.durationMs ?? 0,
      };
      return current
        ? db.audioSegment.update({ where: { id: current.id }, data })
        : db.audioSegment.create({
            data: { ...data, serviceId, sourceId: seq.sourceId, startMs: 0, detectedBy: "deposit" },
          });
    }),
  ]);

  return db.audioSegment.findMany({ where: { serviceId }, orderBy: { order: "asc" } });
}
