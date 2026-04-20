/**
 * Page publique de validation/pré-validation de photos.
 * Accessible via un lien VALIDATOR ou PREVALIDATOR sans authentification.
 */
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { validateMediaShareToken, getSignedThumbnailUrl } from "@/modules/media";
import ValidatorView from "./ValidatorView";

async function fetchValidationData(token: string) {
  try {
    const shareToken = await validateMediaShareToken(token, ["VALIDATOR", "PREVALIDATOR"]);
    const isPrevalidator = shareToken.type === "PREVALIDATOR";
    const event = shareToken.mediaEvent;

    if (!event) return { token: shareToken, event: null, photos: [] };

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
      token: { id: shareToken.id, type: shareToken.type, label: shareToken.label },
      event: {
        id: event.id,
        name: event.name,
        date: event.date.toISOString(),
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
  } catch {
    return null;
  }
}

export default async function ValidatorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await fetchValidationData(token);
  if (!data) notFound();
  return <ValidatorView token={token} data={data} />;
}
