import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { requireAgendaManage } from "@/modules/agenda";
import { prisma } from "@/lib/prisma";
import ScheduleDashboard from "./ScheduleDashboard";

export default async function AgendaSchedulePage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
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
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Planification des RDV</h1>
      <p className="text-sm text-gray-500 mb-6">Demandes validées à planifier</p>
      <ScheduleDashboard requests={requests} />
    </div>
  );
}
