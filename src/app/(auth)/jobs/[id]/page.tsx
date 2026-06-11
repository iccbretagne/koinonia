import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import JobDetailClient from "./JobDetailClient";
import { rolePermissions } from "@/lib/registry";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { id } = await params;

  const job = await prisma.jobOffer.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, displayName: true, image: true } },
    },
  });

  if (!job) notFound();

  const userRoles    = session.user.churchRoles.map((r) => r.role);
  const permissions  = new Set(userRoles.flatMap((r) => rolePermissions[r] ?? []));
  const canManage    = session.user.isSuperAdmin || permissions.has("jobs:manage");
  const isAuthor     = job.authorId === session.user.id;

  return (
    <div className="max-w-2xl mx-auto">
      <JobDetailClient
        job={{
          ...job,
          deadline:  job.deadline  ? job.deadline.toISOString()  : null,
          createdAt: job.createdAt.toISOString(),
          updatedAt: job.updatedAt.toISOString(),
        }}
        canManage={canManage}
        isAuthor={isAuthor}
      />
    </div>
  );
}
