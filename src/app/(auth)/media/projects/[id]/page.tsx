import { requireMediaAccess, isProductionMediaMember, resolveChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { rolePermissions } from "@/lib/registry";
import { getSignedThumbnailUrl } from "@/modules/media";
import MediaProjectDetail from "./MediaProjectDetail";

export default async function MediaProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAuth();

  let churchId: string;
  try {
    churchId = await resolveChurchId("mediaProject", id);
  } catch {
    notFound();
  }

  await requireMediaAccess(churchId!);

  const project = await prisma.mediaProject.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, displayName: true } },
      files: {
        orderBy: { createdAt: "desc" },
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
          },
        },
      },
      shareTokens: {
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { files: true } },
    },
  });

  if (!project) notFound();

  // Générer les URLs signées pour les thumbnails côté serveur
  const thumbnailUrls: Record<string, string> = {};
  await Promise.all(
    project.files.map(async (file) => {
      const key = file.versions[0]?.thumbnailKey;
      if (key) {
        try {
          thumbnailUrls[file.id] = await getSignedThumbnailUrl(key);
        } catch {
          // URL non disponible — la preview sera absente
        }
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
  const canReview = session.user.isSuperAdmin || churchPerms.has("media:review");
  const canManage = session.user.isSuperAdmin || churchPerms.has("media:manage") || isProductionMember;

  return (
    <MediaProjectDetail
      project={project}
      thumbnailUrls={thumbnailUrls}
      canUpload={canUpload}
      canReview={canReview}
      canManage={canManage}
    />
  );
}
