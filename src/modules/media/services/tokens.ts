import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import type { MediaTokenType } from "@/generated/prisma/client";

export function generateToken(): string {
  return randomBytes(32).toString("hex"); // 64 chars
}

export function isTokenExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return new Date() > expiresAt;
}

/** URL path segment par type de token (pour les liens publics). */
export function getTokenUrlPath(type: MediaTokenType): string {
  if (type === "MEDIA") return "d";
  if (type === "GALLERY") return "g";
  return "v";
}

interface CreateTokenOptions {
  type: MediaTokenType;
  label?: string;
  expiresInDays?: number;
  onlyApproved?: boolean;
}

type CreateTokenWithTarget = CreateTokenOptions &
  ({ mediaEventId: string; mediaProjectId?: never } | { mediaProjectId: string; mediaEventId?: never });

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
      mediaProject: { select: { id: true, name: true, churchId: true } },
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

export async function createMediaShareToken(options: CreateTokenWithTarget) {
  const { type, label, expiresInDays, onlyApproved, mediaEventId, mediaProjectId } = options;

  const token = generateToken();
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;
  const config = type === "GALLERY" ? { onlyApproved: onlyApproved ?? false } : null;

  const shareToken = await prisma.mediaShareToken.create({
    data: {
      token,
      type,
      label,
      expiresAt,
      ...(config && { config }),
      ...(mediaEventId && { mediaEventId }),
      ...(mediaProjectId && { mediaProjectId }),
    },
  });

  const baseUrl = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  return {
    ...shareToken,
    url: `${baseUrl}/media/${getTokenUrlPath(type)}/${token}`,
  };
}
