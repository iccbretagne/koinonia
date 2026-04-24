import { requireMediaAccess, isProductionMediaMember, resolveChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { rolePermissions } from "@/lib/registry";
import { getSignedThumbnailUrl } from "@/modules/media";
import MediaEventDetail from "./MediaEventDetail";

export default async function MediaEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAuth();

  let churchId: string;
  try {
    churchId = await resolveChurchId("mediaEvent", id);
  } catch {
    notFound();
  }

  await requireMediaAccess(churchId!);

  const event = await prisma.mediaEvent.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, displayName: true } },
      planningEvent: { select: { id: true, title: true, type: true, date: true } },
      photos: {
        orderBy: { uploadedAt: "desc" },
      },
      shareTokens: {
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { photos: true, files: true } },
    },
  });

  if (!event) notFound();

  // Générer les URLs signées pour les thumbnails (valides 1h)
  const thumbnailUrls: Record<string, string> = {};
  await Promise.all(
    event.photos.map(async (p) => {
      if (p.thumbnailKey) {
        thumbnailUrls[p.id] = await getSignedThumbnailUrl(p.thumbnailKey);
      }
    })
  );

  const churchPerms = new Set(
    session.user.churchRoles
      .filter((r) => r.churchId === churchId!)
      .flatMap((r) => rolePermissions[r.role] ?? [])
  );
  const isProductionMember = await isProductionMediaMember(session, churchId!);
  const canUpload = session.user.isSuperAdmin || churchPerms.has("media:upload") || isProductionMember;
  const canManage = session.user.isSuperAdmin || churchPerms.has("media:manage") || isProductionMember;

  return (
    <MediaEventDetail
      event={event}
      churchId={churchId!}
      thumbnailUrls={thumbnailUrls}
      canUpload={canUpload}
      canManage={canManage}
    />
  );
}
