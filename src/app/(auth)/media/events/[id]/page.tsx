import { requireChurchPermission, resolveChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { rolePermissions } from "@/lib/registry";
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

  await requireChurchPermission("media:view", churchId!);

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

  const userPermissions = new Set(
    session.user.isSuperAdmin
      ? ["media:view", "media:upload", "media:review", "media:manage"]
      : session.user.churchRoles.flatMap((r) => rolePermissions[r.role] ?? [])
  );

  const canUpload = userPermissions.has("media:upload");
  const canReview = userPermissions.has("media:review");
  const canManage = userPermissions.has("media:manage");

  return (
    <MediaEventDetail
      event={event}
      canUpload={canUpload}
      canReview={canReview}
      canManage={canManage}
    />
  );
}
