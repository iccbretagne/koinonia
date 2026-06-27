import { auth, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";

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
  const session = await auth();
  if (!session?.user) redirect("/");
  if (!(session.user.pastoralChurchIds ?? []).length) redirect("/dashboard");

  const currentChurchId = await getCurrentChurchId(session);

  let profile = await prisma.pastoralProfile.findFirst({
    where: {
      userId: session.user.id,
      ...(currentChurchId ? { churchId: currentChurchId } : {}),
    },
    select: { id: true, churchId: true, responsibleForChurch: { select: { id: true } } },
  });
  if (!profile && currentChurchId) {
    profile = await prisma.pastoralProfile.findFirst({
      where: { userId: session.user.id, supervisorForChurches: { some: { id: currentChurchId } } },
      select: { id: true, churchId: true, responsibleForChurch: { select: { id: true } } },
    });
  }
  if (!profile) redirect("/pastoral");

  const activeChurchId = currentChurchId ?? profile.responsibleForChurch?.id ?? profile.churchId;
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
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Link href="/pastoral" className="text-sm text-gray-400 hover:text-icc-violet transition-colors">
          ← Accueil pastoral
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Événements</h1>
        <p className="text-sm text-gray-500 mt-0.5">{church?.name}</p>
      </div>

      {/* Stats année */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center col-span-2 md:col-span-1">
          <p className="text-2xl font-bold text-icc-violet">{totalThisYear}</p>
          <p className="text-xs text-gray-500 mt-1">Événements {now.getFullYear()}</p>
        </div>
        {yearStats.sort((a, b) => b._count - a._count).slice(0, 3).map((g) => (
          <div key={g.type} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-gray-800">{g._count}</p>
            <p className="text-xs text-gray-500 mt-1">{EVENT_TYPE_LABELS[g.type] ?? g.type}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Prochains événements */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-700">À venir</h2>
            <Link href="/events/calendar" className="text-xs text-icc-violet hover:underline">Calendrier →</Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Aucun événement planifié.</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map((e) => {
                const progress = planningProgress(e);
                return (
                  <div key={e.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{e.title}</p>
                        <p className="text-xs text-gray-400">{fmt(e.date)} · {EVENT_TYPE_LABELS[e.type] ?? e.type}</p>
                      </div>
                    </div>
                    {progress !== null && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-medium ${
                            progress.pct === 100 ? "text-emerald-600" : progress.pct > 50 ? "text-icc-violet" : "text-amber-600"
                          }`}>
                            {progress.deptsWithStar} / {progress.totalDepts} équipe{progress.totalDepts > 1 ? "s" : ""} prête{progress.totalDepts > 1 ? "s" : ""}
                          </span>
                          <span className="text-xs text-gray-400">
                            {progress.totalStars} STAR en service
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1">
                          <div
                            className={`h-1 rounded-full transition-all ${
                              progress.pct === 100 ? "bg-emerald-500" : progress.pct > 50 ? "bg-icc-violet" : "bg-amber-400"
                            }`}
                            style={{ width: `${progress.pct}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {e.planningDeadline && e.planningDeadline > now && (
                      <p className="text-xs text-gray-400">Deadline planning : {fmtFull(e.planningDeadline)}</p>
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
            <h2 className="text-base font-semibold text-gray-700">30 derniers jours</h2>
            <Link href="/pastoral/reports" className="text-xs text-icc-violet hover:underline">CRs →</Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Aucun événement sur les 30 derniers jours.</p>
          ) : (
            <div className="space-y-2">
              {recent.map((e) => (
                <div key={e.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                  <div className="w-12 shrink-0 text-xs text-gray-400">{fmt(e.date)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{e.title}</p>
                    {e.report?.speaker && (
                      <p className="text-xs text-gray-400 truncate">{e.report.speaker}</p>
                    )}
                  </div>
                  {e.reportEnabled && (
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                      e.report ? "text-emerald-700 bg-emerald-50" : "text-amber-700 bg-amber-50"
                    }`}>
                      {e.report ? "CR ✓" : "CR manquant"}
                    </span>
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
