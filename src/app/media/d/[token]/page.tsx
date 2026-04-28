/**
 * Page publique téléchargement de photos.
 * Accessible via un lien MEDIA sans authentification.
 */
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { validateMediaShareToken, getSignedThumbnailUrl } from "@/modules/media";
import DownloadView from "./DownloadView";

async function fetchDownloadData(token: string) {
  try {
    const shareToken = await validateMediaShareToken(token, ["MEDIA", "MEDIA_ALL"]);
    const event = shareToken.mediaEvent;

    if (!event) return { token: shareToken, event: null, photos: [] };

    const allStatuses = shareToken.type === "MEDIA_ALL";

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
      token: { id: shareToken.id, type: shareToken.type, label: shareToken.label },
      event: { id: event.id, name: event.name, date: event.date.toISOString(), photoCount: photosWithUrls.length },
      photos: photosWithUrls,
    };
  } catch {
    return null;
  }
}

export default async function DownloadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await fetchDownloadData(token);
  if (!data) notFound();
  return <DownloadView token={token} data={data} />;
}
