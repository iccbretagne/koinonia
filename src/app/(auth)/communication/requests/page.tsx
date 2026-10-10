import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { loadRequestQueue, resolveRequestQueueAccess } from "@/modules/planning";
import PageHeader from "@/components/ui/PageHeader";
import Alert from "@/components/ui/Alert";
import StatusChip from "@/components/ui/StatusChip";
import { CommunicationQueue } from "@/components/requests/TeamQueues";

export default async function CommunicationRequestsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("planning:view", churchId);

  const access = await resolveRequestQueueAccess(session, churchId, "COMMUNICATION");

  if (!access.configured) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Demandes réseaux sociaux" />
        <Alert tone="warning" action={<Link href="/admin/departments/functions" className="font-semibold underline">Configurer maintenant</Link>}>
          Aucun département n&apos;est configuré comme <strong>Communication</strong>.
        </Alert>
      </div>
    );
  }
  if (!access.allowed) return notFound();

  const queue = await loadRequestQueue(churchId, "COMMUNICATION");
  const todo = queue.open.filter((r) => r.status === "EN_ATTENTE").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            Demandes réseaux sociaux
            {todo > 0 && <StatusChip tone="brand">{todo} à traiter</StatusChip>}
          </span>
        }
      />
      <CommunicationQueue data={{ churchId, open: queue.open, done: queue.done, doneCount: queue.doneCount }} />
    </div>
  );
}
