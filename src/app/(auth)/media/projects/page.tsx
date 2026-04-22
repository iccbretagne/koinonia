import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { rolePermissions } from "@/lib/registry";
import MediaProjectsList from "./MediaProjectsList";

export default async function MediaProjectsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("media:view", churchId);

  const [projects, fileStatusRows] = await Promise.all([
    prisma.mediaProject.findMany({
      where: { churchId },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, name: true, displayName: true } },
        _count: { select: { files: true } },
      },
    }),
    prisma.mediaFile.groupBy({
      by: ["mediaProjectId", "status"],
      where: { mediaProject: { churchId } },
      _count: { _all: true },
    }),
  ]);

  type FileCounts = { inReview: number; revisionRequested: number; finalApproved: number; pending: number };
  const fileCounts = new Map<string, FileCounts>();
  for (const row of fileStatusRows) {
    if (!row.mediaProjectId) continue;
    const entry = fileCounts.get(row.mediaProjectId) ?? { inReview: 0, revisionRequested: 0, finalApproved: 0, pending: 0 };
    if (row.status === "IN_REVIEW")           entry.inReview          += row._count._all;
    if (row.status === "REVISION_REQUESTED")  entry.revisionRequested += row._count._all;
    if (row.status === "FINAL_APPROVED")      entry.finalApproved     += row._count._all;
    if (row.status === "PENDING")             entry.pending           += row._count._all;
    fileCounts.set(row.mediaProjectId, entry);
  }

  const projectsWithCounts = projects.map((p) => ({
    ...p,
    fileCounts: fileCounts.get(p.id) ?? { inReview: 0, revisionRequested: 0, finalApproved: 0, pending: 0 },
  }));

  const churchPerms = new Set(
    session.user.churchRoles
      .filter((r) => r.churchId === churchId)
      .flatMap((r) => rolePermissions[r.role] ?? [])
  );
  const canUpload = session.user.isSuperAdmin || churchPerms.has("media:upload");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Projets média</h1>
        {canUpload && (
          <Link href="/media/projects/new">
            <Button>+ Nouveau projet</Button>
          </Link>
        )}
      </div>
      <MediaProjectsList projects={projectsWithCounts} canUpload={canUpload} />
    </div>
  );
}
