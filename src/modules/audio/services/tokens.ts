import type { Prisma, AudioShareToken } from "@/generated/prisma/client";
import { ApiError } from "@/lib/errors";
import { generateToken } from "@/modules/storage";

type DbClient = Prisma.TransactionClient;

async function defaultDb(): Promise<DbClient> {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

/** Chemin public de lecture d'un lien de partage — un seul endroit où `/ecouter/` est écrit en dur. */
export function buildPublicAudioUrl(token: string): string {
  return `/ecouter/${token}`;
}

export interface CreateShareTokenInput {
  serviceId: string;
  churchId: string;
  segmentId?: string; // lien direct vers une séquence, sinon lien vers le culte entier
}

/** Crée un lien de partage — culte entier (`segmentId` absent) ou séquence unique. */
export async function createShareToken(input: CreateShareTokenInput, db?: DbClient): Promise<AudioShareToken> {
  db ??= await defaultDb();

  const service = await db.audioService.findUnique({ where: { id: input.serviceId } });
  if (!service || service.churchId !== input.churchId) {
    throw new ApiError(404, "Culte audio introuvable");
  }

  if (input.segmentId) {
    const segment = await db.audioSegment.findUnique({ where: { id: input.segmentId } });
    if (!segment || segment.serviceId !== input.serviceId) {
      throw new ApiError(404, "Séquence introuvable pour ce culte");
    }
  }

  return db.audioShareToken.create({
    data: { serviceId: input.serviceId, segmentId: input.segmentId ?? null, token: generateToken() },
  });
}

/** Résout un token pour la lecture publique — `null` si inexistant ou révoqué. */
export async function resolveShareToken(token: string, db?: DbClient): Promise<AudioShareToken | null> {
  db ??= await defaultDb();
  const shareToken = await db.audioShareToken.findUnique({ where: { token } });
  if (!shareToken || shareToken.revokedAt) return null;
  return shareToken;
}

/**
 * Retrouve le lien de partage principal (culte entier) d'un culte publié, ou le crée s'il
 * n'existe pas encore — utilisé par le lien croisé événement → audio (spec §1, plan.md §UI).
 */
export async function getOrCreatePrimaryShareToken(
  serviceId: string,
  churchId: string,
  db?: DbClient
): Promise<AudioShareToken> {
  db ??= await defaultDb();

  const existing = await db.audioShareToken.findFirst({
    where: { serviceId, segmentId: null, revokedAt: null },
  });
  if (existing) return existing;

  return createShareToken({ serviceId, churchId }, db);
}

/** Révoque un lien de partage — il devient inopérant, mais reste consultable côté admin. */
export async function revokeShareToken(id: string, churchId: string, db?: DbClient): Promise<AudioShareToken> {
  db ??= await defaultDb();

  const shareToken = await db.audioShareToken.findUnique({ where: { id }, include: { service: true } });
  if (!shareToken || shareToken.service.churchId !== churchId) {
    throw new ApiError(404, "Lien de partage introuvable");
  }

  return db.audioShareToken.update({ where: { id }, data: { revokedAt: new Date() } });
}
