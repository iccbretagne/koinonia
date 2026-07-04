import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { rolePermissions } from "@/lib/registry";
import FreelanceProfileDetailClient from "./FreelanceProfileDetailClient";

export default async function FreelanceProfileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { id } = await params;

  const profile = await prisma.freelanceProfile.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, displayName: true, image: true } },
    },
  });

  if (!profile) notFound();

  const userRoles   = session.user.churchRoles.map((r) => r.role);
  const permissions = new Set(userRoles.flatMap((r) => rolePermissions[r] ?? []));
  const canManage   = session.user.isSuperAdmin || permissions.has("jobs:manage");
  const isAuthor    = profile.authorId === session.user.id;

  if (profile.status !== "ACTIVE" && !isAuthor && !canManage) notFound();

  return (
    <div className="max-w-2xl mx-auto">
      <FreelanceProfileDetailClient
        profile={{
          ...profile,
          availableFrom: profile.availableFrom ? profile.availableFrom.toISOString() : null,
          createdAt:     profile.createdAt.toISOString(),
        }}
        canManage={canManage}
        isAuthor={isAuthor}
      />
    </div>
  );
}
