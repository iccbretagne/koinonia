import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { requireAgendaManage } from "@/modules/agenda/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import ScheduleDashboard from "./ScheduleDashboard";

export default async function AgendaSchedulePage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-sm text-ink-muted">Aucune église sélectionnée.</p>;
  await requireAgendaManage(churchId);

  const requests = await prisma.appointmentRequest.findMany({
    where: { churchId, status: "VALIDATED" },
    include: {
      assignedTo: { select: { id: true, name: true, role: true } },
      qualifiedBy: { select: { id: true, name: true, displayName: true } },
    },
    orderBy: { qualifiedAt: "asc" },
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader eyebrow="Agenda pastoral" title="Planification des RDV" description="Demandes confiées, à planifier." />
      <ScheduleDashboard requests={requests} />
    </div>
  );
}
