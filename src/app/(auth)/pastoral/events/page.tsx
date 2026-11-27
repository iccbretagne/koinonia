import { requirePastoralActiveChurch } from "../active-church";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { PageHeader, StatusChip, buttonClasses } from "@/components/ui";
function progressTextClass(pct: number): string {
  if (pct === 100) return "text-success";
  return pct > 50 ? "text-brand-text" : "text-warning";
}

function progressBarClass(pct: number): string {
  if (pct === 100) return "bg-success";
  return pct > 50 ? "bg-brand" : "bg-warning";
}

function fmt(d: Date) {
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}
function fmtFull(d: Date) {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  CULTE:          "Culte",
  CONFERENCE:     "Conférence",
  FORMATION:      "Formation",
  CONCERT:        "Concert",
  EVANGELISATION: "Évangélisation",
  AUTRE:          "Autre",
};

export default async function PastoralEventsPage() {
  const { activeChurchId } = await requirePastoralActiveChurch();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

  const [upcoming, recent, church, yearStats] = await Promise.all([
    // Prochains événements avec suivi planning
    prisma.event.findMany({
      where: { churchId: activeChurchId, date: { gte: now } },
      orderBy: { date: "asc" },
      take: 10,
      select: {
        id: true,
        title: true,
        type: true,
        date: true,
        planningDeadline: true,
        eventDepts: {
          select: {
            department: { select: { name: true } },
            plannings: { select: { id: true, status: true } },
          },
        },
      },
    }),
    // Événements récents (30 derniers jours) avec CR
    prisma.event.findMany({
      where: { churchId: activeChurchId, date: { lt: now, gte: thirtyDaysAgo } },
      orderBy: { date: "desc" },
      take: 8,
      select: {
        id: true,
        title: true,
        type: true,
        date: true,
        reportEnabled: true,
        report: { select: { id: true, speaker: true } },
      },
    }),
    prisma.church.findUnique({ where: { id: activeChurchId }, select: { name: true } }),
    // Statistiques de l'année
    prisma.event.groupBy({
      by: ["type"],
      where: { churchId: activeChurchId, date: { gte: new Date(now.getFullYear(), 0, 1) } },
      _count: true,
    }),
  ]);

  const totalThisYear = yearStats.reduce((s, g) => s + g._count, 0);

  function planningProgress(event: typeof upcoming[0]) {
    if (event.eventDepts.length === 0) return null;
    const deptsWithStar = event.eventDepts.filter(
      (d) => d.plannings.some((p) => p.status !== null)
    ).length;
    const totalStars = event.eventDepts.flatMap((d) =>
      d.plannings.filter((p) => p.status !== null)
    ).length;
    const totalDepts = event.eventDepts.length;
    return { deptsWithStar, totalDepts, totalStars, pct: Math.round((deptsWithStar / totalDepts) * 100) };
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">

      <PageHeader title="Événements" description={church?.name} />

      {/* Stats année */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-card border border-line bg-surface p-4 shadow-card text-center col-span-2 md:col-span-1">
          <p className="text-2xl font-bold text-brand-text">{totalThisYear}</p>
          <p className="text-xs text-ink-muted mt-1">Événements {now.getFullYear()}</p>
        </div>
        {yearStats.toSorted((a, b) => b._count - a._count).slice(0, 3).map((g) => (
          <div key={g.type} className="rounded-card border border-line bg-surface p-4 shadow-card text-center">
            <p className="text-2xl font-bold text-ink">{g._count}</p>
            <p className="text-xs text-ink-muted mt-1">{EVENT_TYPE_LABELS[g.type] ?? g.type}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Prochains événements */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-[17px] font-semibold text-ink">À venir</h2>
            <Link href="/events" className={`${buttonClasses("ghost", "sm")} min-h-11 sm:min-h-9`}>Voir l&apos;agenda de l&apos;église</Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-ink-muted">Aucun événement planifié.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {upcoming.map((e) => {
                const progress = planningProgress(e);
                return (
                  <div key={e.id} className="flex flex-col gap-1.5 rounded-card border border-line bg-surface px-3 py-2.5 shadow-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink truncate">{e.title}</p>
                        <p className="text-xs text-ink-subtle">{fmt(e.date)} · {EVENT_TYPE_LABELS[e.type] ?? e.type}</p>
                      </div>
                    </div>
                    {progress !== null && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-medium ${
                            progressTextClass(progress.pct)
                          }`}>
                            {progress.deptsWithStar} / {progress.totalDepts} département{progress.totalDepts > 1 ? "s" : ""} prêt{progress.totalDepts > 1 ? "s" : ""}
                          </span>
                          <span className="text-xs text-ink-muted">
                            {progress.totalStars} STAR en service
                          </span>
                        </div>
                        <div className="h-1 w-full rounded-full bg-line" role="img" aria-label={`Planning prêt à ${progress.pct} %`}>
                          <div
                            className={`h-1 rounded-full transition-all ${
                              progressBarClass(progress.pct)
                            }`}
                            style={{ width: `${progress.pct}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {e.planningDeadline && e.planningDeadline > now && (
                      <p className="text-xs text-ink-muted">Date limite du planning : {fmtFull(e.planningDeadline)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Événements récents */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-[17px] font-semibold text-ink">30 derniers jours</h2>
            <Link href="/pastoral/reports" className={`${buttonClasses("ghost", "sm")} min-h-11 sm:min-h-9`}>Voir les comptes rendus</Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-ink-muted">Aucun événement sur les 30 derniers jours.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recent.map((e) => (
                <div key={e.id} className="flex items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 shadow-card">
                  <div className="w-12 shrink-0 text-xs text-ink-subtle">{fmt(e.date)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{e.title}</p>
                    {e.report?.speaker && (
                      <p className="truncate text-xs text-ink-muted">{e.report.speaker}</p>
                    )}
                  </div>
                  {e.reportEnabled && (
                    <StatusChip tone={e.report ? "success" : "warning"} className="shrink-0">
                      {e.report ? "CR rédigé" : "CR manquant"}
                    </StatusChip>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
