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

  const projects = await prisma.mediaProject.findMany({
    where: { churchId },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true, displayName: true } },
      _count: { select: { files: true } },
    },
  });

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
      <MediaProjectsList projects={projects} canUpload={canUpload} />
    </div>
  );
}
