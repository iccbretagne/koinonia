/**
 * GET /api/media/gallery/[token]
 * Retourne la galerie photos (photos approuvées) via token GALLERY.
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
    const shareToken = await validateMediaShareToken(token, "GALLERY");

    const onlyApproved = (shareToken.config as { onlyApproved?: boolean } | null)?.onlyApproved ?? false;
    const tokenInfo = { id: shareToken.id, type: shareToken.type, label: shareToken.label, config: shareToken.config };

    // ── Événement (photos) ──────────────────────────────────────────────────────
    if (shareToken.mediaEvent) {
      const event = shareToken.mediaEvent;

      const photos = await prisma.mediaPhoto.findMany({
        where: {
          mediaEventId: event.id,
          ...(onlyApproved ? { status: "APPROVED" } : {}),
        },
        orderBy: { uploadedAt: "asc" },
      });

      const photosWithUrls = await Promise.all(
        photos.map(async (p) => ({
          id: p.id,
          filename: p.filename,
          status: p.status,
          width: p.width,
          height: p.height,
          thumbnailUrl: await getSignedThumbnailUrl(p.thumbnailKey),
        }))
      );

      return successResponse({
        token: tokenInfo,
        event: { id: event.id, name: event.name, date: event.date, photoCount: photosWithUrls.length },
        photos: photosWithUrls,
      });
    }

    // ── Projet (fichiers) ───────────────────────────────────────────────────────
    if (shareToken.mediaProject) {
      const project = shareToken.mediaProject;
      const files = project.files.filter(
        (f) => !onlyApproved || APPROVED_FILE_STATUSES.has(f.status)
      );

      const filesWithUrls = await Promise.all(
        files.map(async (f) => ({
          id: f.id,
          filename: f.filename,
          status: f.status,
          width: null,
          height: null,
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
