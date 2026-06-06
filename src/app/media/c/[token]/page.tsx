/**
 * Page publique collection multi-sources.
 * Accessible via un lien COLLECTION sans authentification.
 */
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { validateMediaShareToken, getSignedThumbnailUrl } from "@/modules/media";
import type { CollectionConfig } from "@/modules/media";
import CollectionView from "./CollectionView";

async function fetchCollectionData(token: string) {
  try {
    const shareToken = await validateMediaShareToken(token, "COLLECTION");
    const config = shareToken.config as CollectionConfig | null;
    if (!config) return null;

    const { scope, eventIds, projectIds } = config;

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
        photoGroups.push({
          eventId: event.id,
          eventName: event.name,
          eventDate: event.date.toISOString(),
          photos,
        });
      }
    }

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

    return {
      token: { id: shareToken.id, label: shareToken.label, config },
      photoGroups,
      fileGroups,
    };
  } catch {
    return null;
  }
}

export default async function CollectionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await fetchCollectionData(token);
  if (!data) notFound();
  return <CollectionView token={token} data={data} />;
}
