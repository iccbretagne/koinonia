import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { loadRequestQueue, resolveRequestQueueAccess } from "@/modules/planning";
import PageHeader from "@/components/ui/PageHeader";
import Alert from "@/components/ui/Alert";
import StatusChip from "@/components/ui/StatusChip";
import { VisuelQueue } from "@/components/requests/TeamQueues";

export default async function MediaRequestsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("planning:view", churchId);

  const access = await resolveRequestQueueAccess(session, churchId, "PRODUCTION_MEDIA");

  if (!access.configured) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Demandes visuels" />
        <Alert tone="warning" action={<Link href="/admin/departments/functions" className="font-semibold underline">Configurer maintenant</Link>}>
          Aucun département n&apos;est configuré comme <strong>Production Média</strong>.
        </Alert>
      </div>
    );
  }
  if (!access.allowed) return notFound();

  const [queue, projects] = await Promise.all([
    loadRequestQueue(churchId, "PRODUCTION_MEDIA"),
    prisma.mediaProject
      .findMany({
        where: { churchId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          shareTokens: {
            select: { token: true, type: true },
            where: { type: { in: ["GALLERY", "MEDIA", "MEDIA_ALL"] } },
            take: 1,
          },
        },
      })
      .catch(() => []),
  ]);
  const todo = queue.open.filter((r) => r.status === "EN_ATTENTE").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            Demandes visuels
            {todo > 0 && <StatusChip tone="brand">{todo} à traiter</StatusChip>}
          </span>
        }
      />
      <VisuelQueue data={{ churchId, open: queue.open, done: queue.done, doneCount: queue.doneCount }} projects={projects} />
    </div>
  );
}
