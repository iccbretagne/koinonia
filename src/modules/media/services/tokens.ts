import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { getSignedThumbnailUrl } from "./s3";
import type { MediaTokenType, Prisma } from "@/generated/prisma/client";

const APPROVED_FILE_STATUSES = new Set<string>(["APPROVED", "FINAL_APPROVED"]);

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
          createdAt: true,
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

export type ResolvedMediaEntry = {
  id: string;
  filename: string;
  size: number;
  width: number | null;
  height: number | null;
  status: string;
  thumbnailUrl: string;
};

export type ResolvedMediaData = {
  token: { id: string; type: MediaTokenType; label: string | null };
  event: { id: string; name: string; date: Date; photoCount: number } | null;
  photos: ResolvedMediaEntry[];
};

/**
 * Résout les médias accessibles pour un token MEDIA / MEDIA_ALL déjà validé
 * (événement → photos, projet → fichiers validés). Partagé entre la route API
 * et la page SSR publique pour éviter toute divergence entre les deux.
 */
export async function resolveDownloadData(
  shareToken: Awaited<ReturnType<typeof validateMediaShareToken>>
): Promise<ResolvedMediaData> {
  const allStatuses = shareToken.type === "MEDIA_ALL";
  const tokenInfo = { id: shareToken.id, type: shareToken.type, label: shareToken.label };

  if (shareToken.mediaEvent) {
    const event = shareToken.mediaEvent;
    const photos = await prisma.mediaPhoto.findMany({
      where: { mediaEventId: event.id, ...(!allStatuses && { status: "APPROVED" }) },
      orderBy: { uploadedAt: "asc" },
    });
    const photosWithUrls = await Promise.all(
      photos.map(async (p) => ({
        id: p.id,
        filename: p.filename,
        size: p.size,
        width: p.width,
        height: p.height,
        status: p.status,
        thumbnailUrl: await getSignedThumbnailUrl(p.thumbnailKey),
      }))
    );
    return {
      token: tokenInfo,
      event: { id: event.id, name: event.name, date: event.date, photoCount: photosWithUrls.length },
      photos: photosWithUrls,
    };
  }

  if (shareToken.mediaProject) {
    const project = shareToken.mediaProject;
    const files = project.files.filter((f) => allStatuses || APPROVED_FILE_STATUSES.has(f.status));
    const filesWithUrls = await Promise.all(
      files.map(async (f) => ({
        id: f.id,
        filename: f.filename,
        size: f.size,
        width: null,
        height: null,
        status: f.status,
        thumbnailUrl: f.versions[0]?.thumbnailKey
          ? await getSignedThumbnailUrl(f.versions[0].thumbnailKey)
          : "",
      }))
    );
    return {
      token: tokenInfo,
      event: { id: project.id, name: project.name, date: project.createdAt, photoCount: filesWithUrls.length },
      photos: filesWithUrls,
    };
  }

  return { token: tokenInfo, event: null, photos: [] };
}

export type ResolvedGalleryData = {
  token: { id: string; type: MediaTokenType; label: string | null; config: Prisma.JsonValue };
  event: { id: string; name: string; date: Date; photoCount: number } | null;
  photos: ResolvedMediaEntry[];
};

/**
 * Résout les médias accessibles pour un token GALLERY déjà validé
 * (événement → photos, projet → fichiers). Partagé entre la route API
 * et la page SSR publique pour éviter toute divergence entre les deux.
 */
export async function resolveGalleryData(
  shareToken: Awaited<ReturnType<typeof validateMediaShareToken>>
): Promise<ResolvedGalleryData> {
  const onlyApproved = (shareToken.config as { onlyApproved?: boolean } | null)?.onlyApproved ?? false;
  const tokenInfo = { id: shareToken.id, type: shareToken.type, label: shareToken.label, config: shareToken.config };

  if (shareToken.mediaEvent) {
    const event = shareToken.mediaEvent;
    const photos = await prisma.mediaPhoto.findMany({
      where: { mediaEventId: event.id, ...(onlyApproved ? { status: "APPROVED" } : {}) },
      orderBy: { uploadedAt: "asc" },
    });
    const photosWithUrls = await Promise.all(
      photos.map(async (p) => ({
        id: p.id,
        filename: p.filename,
        size: p.size,
        width: p.width,
        height: p.height,
        status: p.status,
        thumbnailUrl: await getSignedThumbnailUrl(p.thumbnailKey),
      }))
    );
    return {
      token: tokenInfo,
      event: { id: event.id, name: event.name, date: event.date, photoCount: photosWithUrls.length },
      photos: photosWithUrls,
    };
  }

  if (shareToken.mediaProject) {
    const project = shareToken.mediaProject;
    const files = project.files.filter((f) => !onlyApproved || APPROVED_FILE_STATUSES.has(f.status));
    const filesWithUrls = await Promise.all(
      files.map(async (f) => ({
        id: f.id,
        filename: f.filename,
        size: f.size,
        width: null,
        height: null,
        status: f.status,
        thumbnailUrl: f.versions[0]?.thumbnailKey
          ? await getSignedThumbnailUrl(f.versions[0].thumbnailKey)
          : "",
      }))
    );
    return {
      token: tokenInfo,
      event: { id: project.id, name: project.name, date: project.createdAt, photoCount: filesWithUrls.length },
      photos: filesWithUrls,
    };
  }

  return { token: tokenInfo, event: null, photos: [] };
}

export type ResolvedCollectionData = {
  token: { id: string; type: MediaTokenType; label: string | null; config: CollectionConfig };
  photoGroups: {
    eventId: string;
    eventName: string;
    eventDate: string;
    photos: { id: string; filename: string; size: number; width: number | null; height: number | null; thumbnailUrl: string }[];
  }[];
  fileGroups: {
    projectId: string;
    projectName: string;
    files: { id: string; filename: string; type: string; size: number; width: number | null; height: number | null; thumbnailUrl: string }[];
  }[];
};

/**
 * Résout le contenu d'un token COLLECTION déjà validé (photos d'événements +
 * fichiers de projets, selon le scope configuré). Partagé entre la route API
 * et la page SSR publique pour éviter toute divergence entre les deux.
 */
export async function resolveCollectionData(
  shareToken: Awaited<ReturnType<typeof validateMediaShareToken>>
): Promise<ResolvedCollectionData | null> {
  const config = shareToken.config as CollectionConfig | null;
  if (!config) return null;

  const { scope, eventIds, projectIds } = config;
  const photoGroups: ResolvedCollectionData["photoGroups"] = [];
  const fileGroups: ResolvedCollectionData["fileGroups"] = [];

  if ((scope === "photos" || scope === "both") && eventIds.length > 0) {
    const events = await prisma.mediaEvent.findMany({
      where: { id: { in: eventIds } },
      orderBy: { date: "desc" },
      include: {
        photos: {
          where: collectionPhotoWhere(config),
          orderBy: { uploadedAt: "asc" },
          select: { id: true, filename: true, size: true, width: true, height: true, thumbnailKey: true },
        },
      },
    });

    for (const event of events) {
      const photos = await Promise.all(
        event.photos.map(async (p) => ({
          id: p.id,
          filename: p.filename,
          size: p.size,
          width: p.width,
          height: p.height,
          thumbnailUrl: await getSignedThumbnailUrl(p.thumbnailKey),
        }))
      );
      photoGroups.push({ eventId: event.id, eventName: event.name, eventDate: event.date.toISOString(), photos });
    }
  }

  if ((scope === "files" || scope === "both") && projectIds.length > 0) {
    const projects = await prisma.mediaProject.findMany({
      where: { id: { in: projectIds } },
      orderBy: { createdAt: "desc" },
      include: {
        files: {
          where: { status: { in: ["APPROVED", "FINAL_APPROVED"] } },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            filename: true,
            type: true,
            size: true,
            width: true,
            height: true,
            versions: {
              orderBy: { versionNumber: "desc" },
              take: 1,
              select: { thumbnailKey: true },
            },
          },
        },
      },
    });

    for (const project of projects) {
      const files = await Promise.all(
        project.files.map(async (f) => ({
          id: f.id,
          filename: f.filename,
          type: f.type,
          size: f.size,
          width: f.width,
          height: f.height,
          thumbnailUrl: f.versions[0]?.thumbnailKey
            ? await getSignedThumbnailUrl(f.versions[0].thumbnailKey)
            : "",
        }))
      );
      fileGroups.push({ projectId: project.id, projectName: project.name, files });
    }
  }

  return {
    token: { id: shareToken.id, type: shareToken.type, label: shareToken.label, config },
    photoGroups,
    fileGroups,
  };
}

export type ResolvedValidatorEventData = {
  type: "event";
  token: { id: string; type: MediaTokenType; label: string | null };
  event: {
    id: string;
    name: string;
    date: Date;
    status: string;
    isPrevalidator: boolean;
    hasPrevalidator: boolean;
    totalPhotos: number;
    approvedCount: number;
    pendingCount: number;
    rejectedCount: number;
    prevalidatedCount: number;
    prerejectedCount: number;
  };
  photos: Array<{ id: string; filename: string; status: string; size: number; width: number | null; height: number | null; thumbnailUrl: string }>;
};

export type ResolvedValidatorProjectData = {
  type: "project";
  token: { id: string; type: MediaTokenType; label: string | null };
  project: {
    id: string;
    name: string;
    isPrevalidator: boolean;
    hasPrevalidator: boolean;
    totalFiles: number;
  };
  files: Array<{
    id: string;
    filename: string;
    type: string;
    mimeType: string;
    size: number;
    status: string;
    thumbnailUrl: string | null;
  }>;
};

/**
 * Résout les données d'un token VALIDATOR/PREVALIDATOR déjà validé — événement
 * (photos à valider) ou projet (fichiers à valider). Partagé entre la route API
 * et la page SSR publique pour éviter toute divergence entre les deux.
 */
export async function resolveValidatorData(
  shareToken: Awaited<ReturnType<typeof validateMediaShareToken>>
): Promise<ResolvedValidatorEventData | ResolvedValidatorProjectData | null> {
  const isPrevalidator = shareToken.type === "PREVALIDATOR";
  const tokenInfo = { id: shareToken.id, type: shareToken.type, label: shareToken.label };

  if (shareToken.mediaProject) {
    const project = shareToken.mediaProject;
    const hasPrevalidator = project.shareTokens.some((t) => t.type === "PREVALIDATOR");

    const filesWithUrls = await Promise.all(
      project.files.map(async (f) => {
        const thumbKey = f.versions[0]?.thumbnailKey;
        let thumbnailUrl: string | null = null;
        if (thumbKey && f.mimeType.startsWith("image/")) {
          try {
            thumbnailUrl = await getSignedThumbnailUrl(thumbKey);
          } catch {
            // pas de preview
          }
        }
        return {
          id: f.id,
          filename: f.filename,
          type: f.type,
          mimeType: f.mimeType,
          size: f.size,
          status: f.status,
          thumbnailUrl,
        };
      })
    );

    return {
      type: "project",
      token: tokenInfo,
      project: {
        id: project.id,
        name: project.name,
        isPrevalidator,
        hasPrevalidator,
        totalFiles: filesWithUrls.length,
      },
      files: filesWithUrls,
    };
  }

  if (shareToken.mediaEvent) {
    const event = shareToken.mediaEvent;
    const hasPrevalidator = event.shareTokens.some((t) => t.type === "PREVALIDATOR");

    let statusFilter: string[];
    if (isPrevalidator) {
      statusFilter = ["PENDING"];
    } else if (hasPrevalidator) {
      statusFilter = ["PREVALIDATED", "APPROVED", "REJECTED"];
    } else {
      statusFilter = ["PENDING", "PREVALIDATED", "APPROVED", "REJECTED"];
    }

    const photos = await prisma.mediaPhoto.findMany({
      where: {
        mediaEventId: event.id,
        status: { in: statusFilter as ("PENDING" | "APPROVED" | "REJECTED" | "PREVALIDATED" | "PREREJECTED")[] },
      },
      orderBy: { uploadedAt: "asc" },
    });

    const photosWithUrls = await Promise.all(
      photos.map(async (p) => ({ ...p, thumbnailUrl: await getSignedThumbnailUrl(p.thumbnailKey) }))
    );

    return {
      type: "event",
      token: tokenInfo,
      event: {
        id: event.id,
        name: event.name,
        date: event.date,
        status: event.status,
        isPrevalidator,
        hasPrevalidator,
        totalPhotos: event.photos.length,
        approvedCount: event.photos.filter((p) => p.status === "APPROVED").length,
        pendingCount: event.photos.filter((p) => p.status === "PENDING").length,
        rejectedCount: event.photos.filter((p) => p.status === "REJECTED").length,
        prevalidatedCount: event.photos.filter((p) => p.status === "PREVALIDATED").length,
        prerejectedCount: event.photos.filter((p) => p.status === "PREREJECTED").length,
      },
      photos: photosWithUrls,
    };
  }

  return null;
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
