import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { rolePermissions } from "@/lib/registry";
import SeekerDetailClient from "./SeekerDetailClient";

export default async function SeekerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { id } = await params;

  const seeker = await prisma.jobSeeker.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, displayName: true, image: true } },
    },
  });

  if (!seeker) notFound();

  const userRoles   = session.user.churchRoles.map((r) => r.role);
  const permissions = new Set(userRoles.flatMap((r) => rolePermissions[r] ?? []));
  const canManage   = session.user.isSuperAdmin || permissions.has("jobs:manage");
  const isAuthor    = seeker.authorId === session.user.id;

  if (seeker.status !== "ACTIVE" && !isAuthor && !canManage) notFound();

  return (
    <div className="max-w-2xl mx-auto">
      <SeekerDetailClient
        seeker={{
          ...seeker,
          availableFrom: seeker.availableFrom ? seeker.availableFrom.toISOString() : null,
          createdAt:     seeker.createdAt.toISOString(),
        }}
        canManage={canManage}
        isAuthor={isAuthor}
      />
    </div>
  );
}
