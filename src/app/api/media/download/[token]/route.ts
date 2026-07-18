/**
 * GET /api/media/download/[token]
 * Retourne les médias accessibles au téléchargement (token MEDIA / MEDIA_ALL).
 * - Token lié à un événement : photos (approuvées, ou toutes si MEDIA_ALL).
 * - Token lié à un projet : fichiers validés (APPROVED/FINAL_APPROVED,
 *   ou tous les non-brouillons si MEDIA_ALL).
 */
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { validateMediaShareToken, getSignedThumbnailUrl } from "@/modules/media";

const APPROVED_FILE_STATUSES = new Set<string>(["APPROVED", "FINAL_APPROVED"]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const shareToken = await validateMediaShareToken(token, ["MEDIA", "MEDIA_ALL"]);
    const allStatuses = shareToken.type === "MEDIA_ALL";
    const tokenInfo = { id: shareToken.id, type: shareToken.type, label: shareToken.label };

    // ── Événement (photos) ──────────────────────────────────────────────────────
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

      return successResponse({
        token: tokenInfo,
        event: { id: event.id, name: event.name, date: event.date, photoCount: photosWithUrls.length },
        photos: photosWithUrls,
      });
    }

    // ── Projet (fichiers validés) ───────────────────────────────────────────────
    if (shareToken.mediaProject) {
      const project = shareToken.mediaProject;
      const files = project.files.filter(
        (f) => allStatuses || APPROVED_FILE_STATUSES.has(f.status)
      );

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

      return successResponse({
        token: tokenInfo,
        event: { id: project.id, name: project.name, date: project.createdAt, photoCount: filesWithUrls.length },
        photos: filesWithUrls,
      });
    }

    return successResponse({ token: tokenInfo, event: null, photos: [] });
  } catch (error) {
    return errorResponse(error);
  }
}
