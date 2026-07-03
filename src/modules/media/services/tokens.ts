import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import type { MediaTokenType, Prisma } from "@/generated/prisma/client";

export function generateToken(): string {
  return randomBytes(32).toString("hex"); // 64 chars
}

export function isTokenExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return new Date() > expiresAt;
}

/** URL path segment par type de token (pour les liens publics). */
export function getTokenUrlPath(type: MediaTokenType): string {
  if (type === "MEDIA" || type === "MEDIA_ALL") return "d";
  if (type === "GALLERY") return "g";
  if (type === "COLLECTION") return "c";
  return "v";
}

export interface CollectionConfig {
  scope: "photos" | "files" | "both";
  eventIds: string[];
  projectIds: string[];
  /** Défaut absent = faux = photos validées uniquement. */
  includeAllPhotos?: boolean;
}

/** Filtre Prisma des photos d'une collection selon son périmètre. */
export function collectionPhotoWhere(config: CollectionConfig): Prisma.MediaPhotoWhereInput {
  return config.includeAllPhotos ? {} : { status: "APPROVED" };
}

interface CreateTokenOptions {
  type: MediaTokenType;
  label?: string;
  expiresInDays?: number;
  onlyApproved?: boolean;
  collectionConfig?: CollectionConfig;
}

type CreateTokenWithTarget = CreateTokenOptions &
  (
    | { mediaEventId: string; mediaProjectId?: never }
    | { mediaProjectId: string; mediaEventId?: never }
    | { mediaEventId?: never; mediaProjectId?: never }
  );

/** Valide un token de partage et retourne ses données + l'événement ou projet lié. */
export async function validateMediaShareToken(
  token: string,
  requiredTypes?: MediaTokenType | MediaTokenType[]
) {
  const shareToken = await prisma.mediaShareToken.findUnique({
    where: { token },
    include: {
      mediaEvent: {
        include: {
          photos: { select: { status: true } },
          shareTokens: { select: { type: true } },
        },
      },
      mediaProject: {
        select: {
          id: true,
          name: true,
          churchId: true,
          shareTokens: { select: { type: true } },
          files: {
            orderBy: { createdAt: "asc" as const },
            where: { status: { not: "DRAFT" } },
            select: {
              id: true,
              filename: true,
              type: true,
              mimeType: true,
              size: true,
              status: true,
              versions: {
                orderBy: { versionNumber: "desc" as const },
                take: 1,
                select: { thumbnailKey: true, originalKey: true },
              },
            },
          },
        },
      },
    },
  });

  if (!shareToken) throw new ApiError(401, "Token invalide");
  if (isTokenExpired(shareToken.expiresAt)) throw new ApiError(401, "Token expiré");

  if (requiredTypes) {
    const allowed = Array.isArray(requiredTypes) ? requiredTypes : [requiredTypes];
    if (!allowed.includes(shareToken.type)) throw new ApiError(403, "Type de token non autorisé");
  }

  // Update usage stats
  await prisma.mediaShareToken.update({
    where: { id: shareToken.id },
    data: { lastUsedAt: new Date(), usageCount: { increment: 1 } },
  });

  return shareToken;
}

export async function createMediaShareToken(options: CreateTokenWithTarget & { baseUrl?: string }) {
  const { type, label, expiresInDays, onlyApproved, collectionConfig, mediaEventId, mediaProjectId, baseUrl: callerBaseUrl } = options;

  const token = generateToken();
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;
  const config =
    type === "GALLERY"
      ? { onlyApproved: onlyApproved ?? false }
      : type === "COLLECTION" && collectionConfig
        ? collectionConfig
        : null;

  // Prisma requires exactly one of mediaEventId / mediaProjectId / neither (for COLLECTION)
  // We must build the data object with a concrete shape to satisfy the union type.
  const configValue = config as unknown as Prisma.InputJsonValue;
  const baseData = { token, type, label, expiresAt, ...(config ? { config: configValue } : {}) };
  const shareToken = await prisma.mediaShareToken.create({
    data: mediaEventId
      ? { ...baseData, mediaEventId }
      : mediaProjectId
        ? { ...baseData, mediaProjectId }
        : baseData,
  });

  const baseUrl = callerBaseUrl ?? process.env.APP_URL ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  return {
    ...shareToken,
    url: `${baseUrl}/media/${getTokenUrlPath(type)}/${token}`,
  };
}
