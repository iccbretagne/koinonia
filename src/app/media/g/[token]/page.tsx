/**
 * Page publique galerie photos.
 * Accessible via un lien GALLERY sans authentification.
 */
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { validateMediaShareToken, getSignedThumbnailUrl } from "@/modules/media";
import GalleryView from "./GalleryView";

async function fetchGalleryData(token: string) {
  try {
    const shareToken = await validateMediaShareToken(token, "GALLERY");
    const onlyApproved = (shareToken.config as { onlyApproved?: boolean } | null)?.onlyApproved ?? false;
    const event = shareToken.mediaEvent;

    if (!event) return { token: shareToken, event: null, photos: [] };

    const photos = await prisma.mediaPhoto.findMany({
      where: { mediaEventId: event.id, ...(onlyApproved ? { status: "APPROVED" } : {}) },
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

    return {
      token: { id: shareToken.id, type: shareToken.type, label: shareToken.label, config: shareToken.config },
      event: { id: event.id, name: event.name, date: event.date.toISOString(), photoCount: photosWithUrls.length },
      photos: photosWithUrls,
    };
  } catch {
    return null;
  }
}

export default async function GalleryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await fetchGalleryData(token);
  if (!data) notFound();
  return <GalleryView data={data} />;
}
