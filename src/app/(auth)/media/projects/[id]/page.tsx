import { requireChurchPermission, resolveChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { rolePermissions } from "@/lib/registry";
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

  await requireChurchPermission("media:view", churchId!);

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

  const userPermissions = new Set(
    session.user.isSuperAdmin
      ? ["media:view", "media:upload", "media:review", "media:manage"]
      : session.user.churchRoles.flatMap((r) => rolePermissions[r.role] ?? [])
  );

  const canUpload = userPermissions.has("media:upload");
  const canReview = userPermissions.has("media:review");
  const canManage = userPermissions.has("media:manage");

  return (
    <MediaProjectDetail
      project={project}
      canUpload={canUpload}
      canReview={canReview}
      canManage={canManage}
    />
  );
}
