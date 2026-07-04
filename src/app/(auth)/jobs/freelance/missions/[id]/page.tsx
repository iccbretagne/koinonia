import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { rolePermissions } from "@/lib/registry";
import MissionDetailClient from "./MissionDetailClient";

export default async function MissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { id } = await params;

  const mission = await prisma.freelanceMission.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, displayName: true, image: true } },
    },
  });

  if (!mission) notFound();

  const userRoles   = session.user.churchRoles.map((r) => r.role);
  const permissions = new Set(userRoles.flatMap((r) => rolePermissions[r] ?? []));
  const canManage   = session.user.isSuperAdmin || permissions.has("jobs:manage");
  const isAuthor    = mission.authorId === session.user.id;

  if (mission.status !== "ACTIVE" && !isAuthor && !canManage) notFound();

  return (
    <div className="max-w-2xl mx-auto">
      <MissionDetailClient
        mission={{
          ...mission,
          createdAt: mission.createdAt.toISOString(),
        }}
        canManage={canManage}
        isAuthor={isAuthor}
      />
    </div>
  );
}
