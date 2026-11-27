import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ReportsClient from "./ReportsClient";
import { PageHeader } from "@/components/ui";

export default async function ReportsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-ink-muted">Aucune église sélectionnée.</p>;
  await requireChurchPermission("reports:view", churchId);

  const events = await prisma.event.findMany({
    where: { churchId, reportEnabled: true },
    select: {
      id: true,
      title: true,
      date: true,
      type: true,
      statsEnabled: true,
      report: {
        select: {
          id: true,
          updatedAt: true,
          notes: true,
          decisions: true,
          sections: {
            select: { label: true, stats: true, notes: true },
            orderBy: { position: "asc" },
          },
        },
      },
    },
    orderBy: { date: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Comptes rendus"
        description="Suivi des comptes rendus d'événements et statistiques agrégées."
      />

      <ReportsClient
        churchId={churchId}
        events={events.map((e) => ({
          id: e.id,
          title: e.title,
          date: e.date.toISOString(),
          type: e.type,
          statsEnabled: e.statsEnabled,
          report: e.report
            ? {
                id: e.report.id,
                updatedAt: e.report.updatedAt.toISOString(),
                hasContent: !!(e.report.notes || e.report.decisions || e.report.sections.some((s) => s.notes || s.stats)),
                sections: e.report.sections.map((s) => ({
                  label: s.label,
                  stats: s.stats as Record<string, number> | null,
                })),
              }
            : null,
        }))}
      />
    </div>
  );
}
