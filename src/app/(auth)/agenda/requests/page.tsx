import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { requireAgendaQualify } from "@/modules/agenda";
import { prisma } from "@/lib/prisma";
import QualificationDashboard from "./QualificationDashboard";

export default async function AgendaRequestsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireAgendaQualify(churchId);

  const [requests, profiles] = await Promise.all([
    prisma.appointmentRequest.findMany({
      where: { churchId, status: "PENDING" },
      include: { user: { select: { id: true, name: true, displayName: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.pastoralProfile.findMany({
      where: { churchId },
      select: { id: true, name: true, role: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
  ]);

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Qualification des demandes</h1>
      <p className="text-sm text-gray-500 mb-6">Demandes en attente de qualification</p>
      <QualificationDashboard churchId={churchId} requests={requests} profiles={profiles} />
    </div>
  );
}
