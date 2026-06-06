/**
 * GET /api/media/collection/[token]
 * Retourne les contenus d'une collection multi-sources (token COLLECTION).
 */
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { validateMediaShareToken, getSignedThumbnailUrl } from "@/modules/media";
import type { CollectionConfig } from "@/modules/media";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const shareToken = await validateMediaShareToken(token, "COLLECTION");
    const config = shareToken.config as CollectionConfig | null;

    if (!config) throw new ApiError(400, "Configuration de collection manquante");

    const { scope, eventIds, projectIds } = config;

    // ── Photos (scope: photos | both) ──────────────────────────────────────────
    type PhotoGroup = {
      eventId: string;
      eventName: string;
      eventDate: string;
      photos: { id: string; filename: string; size: number; width: number | null; height: number | null; thumbnailUrl: string }[];
    };
    const photoGroups: PhotoGroup[] = [];

    if ((scope === "photos" || scope === "both") && eventIds.length > 0) {
      const events = await prisma.mediaEvent.findMany({
        where: { id: { in: eventIds } },
        orderBy: { date: "desc" },
        include: {
          photos: {
            where: { status: "APPROVED" },
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

    // ── Fichiers/Visuels (scope: files | both) ─────────────────────────────────
    type FileGroup = {
      projectId: string;
      projectName: string;
      files: { id: string; filename: string; type: string; size: number; width: number | null; height: number | null; thumbnailUrl: string }[];
    };
    const fileGroups: FileGroup[] = [];

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

    const totalPhotos = photoGroups.reduce((n, g) => n + g.photos.length, 0);
    const totalFiles  = fileGroups.reduce((n, g) => n + g.files.length, 0);

    return successResponse({
      token: { id: shareToken.id, type: shareToken.type, label: shareToken.label, config },
      photoGroups,
      fileGroups,
      totalPhotos,
      totalFiles,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
