/**
 * Page publique de validation/pré-validation — photos (event) ou fichiers (projet).
 * Accessible via un lien VALIDATOR ou PREVALIDATOR sans authentification.
 */
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { validateMediaShareToken, getSignedThumbnailUrl } from "@/modules/media";
import ValidatorView from "./ValidatorView";
import ProjectValidatorView from "./ProjectValidatorView";

async function fetchEventValidationData(token: string) {
  try {
    const shareToken = await validateMediaShareToken(token, ["VALIDATOR", "PREVALIDATOR"]);
    if (!shareToken.mediaEvent) return null;

    const isPrevalidator = shareToken.type === "PREVALIDATOR";
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
      type: "event" as const,
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

async function fetchProjectValidationData(token: string) {
  try {
    const shareToken = await validateMediaShareToken(token, ["VALIDATOR", "PREVALIDATOR"]);
    if (!shareToken.mediaProject) return null;

    const isPrevalidator = shareToken.type === "PREVALIDATOR";
    const project = shareToken.mediaProject;
    const hasPrevalidator = project.shareTokens.some((t) => t.type === "PREVALIDATOR");

    const filesWithUrls = await Promise.all(
      project.files.map(async (f) => {
        const thumbKey = f.versions[0]?.thumbnailKey;
        let thumbnailUrl: string | null = null;
        if (thumbKey && f.mimeType.startsWith("image/")) {
          try { thumbnailUrl = await getSignedThumbnailUrl(thumbKey); } catch { /* pas de preview */ }
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
      type: "project" as const,
      token: { id: shareToken.id, type: shareToken.type, label: shareToken.label },
      project: {
        id: project.id,
        name: project.name,
        isPrevalidator,
        hasPrevalidator,
        totalFiles: filesWithUrls.length,
      },
      files: filesWithUrls,
    };
  } catch {
    return null;
  }
}

export default async function ValidatorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Detect project vs event by trying each
  const shareToken = await (async () => {
    try { return await validateMediaShareToken(token, ["VALIDATOR", "PREVALIDATOR"]); } catch { return null; }
  })();

  if (!shareToken) notFound();

  if (shareToken!.mediaProjectId) {
    const data = await fetchProjectValidationData(token);
    if (!data) notFound();
    return <ProjectValidatorView token={token} data={data} />;
  }

  const data = await fetchEventValidationData(token);
  if (!data) notFound();
  return <ValidatorView token={token} data={{ token: data.token, event: data.event, photos: data.photos }} />;
}
