import { auth, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button-classes";
function fmt(d: Date) {
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

export default async function PastoralReportsPage() {
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

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const [events, church] = await Promise.all([
    prisma.event.findMany({
      where: { churchId: activeChurchId, date: { gte: threeMonthsAgo, lte: new Date() } },
      orderBy: { date: "desc" },
      take: 30,
      select: {
        id: true,
        title: true,
        type: true,
        date: true,
        reportEnabled: true,
        report: {
          select: {
            id: true,
            speaker: true,
            messageTitle: true,
            updatedAt: true,
            sections: { select: { id: true } },
          },
        },
      },
    }),
    prisma.church.findUnique({ where: { id: activeChurchId }, select: { name: true } }),
  ]);

  const withReport = events.filter((e) => e.report !== null);
  const withoutReport = events.filter((e) => e.report === null && e.reportEnabled);
  const notEnabled = events.filter((e) => !e.reportEnabled);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Link href="/pastoral" className="text-sm text-ink-subtle hover:text-brand-text transition-colors">
          ← Accueil pastoral
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-ink">Comptes rendus</h1>
        <p className="text-sm text-ink-muted mt-0.5">{church?.name} · 3 derniers mois</p>
      </div>

      {/* Résumé */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface border border-line rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-success">{withReport.length}</p>
          <p className="text-xs text-ink-muted mt-1">CR rédigés</p>
        </div>
        <div className="bg-surface border border-line rounded-xl p-4 text-center">
          <p className={`text-2xl font-bold ${withoutReport.length > 0 ? "text-warning" : "text-ink-subtle"}`}>{withoutReport.length}</p>
          <p className="text-xs text-ink-muted mt-1">En attente</p>
        </div>
        <div className="bg-surface border border-line rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-ink-subtle">{events.length}</p>
          <p className="text-xs text-ink-muted mt-1">Événements total</p>
        </div>
      </div>

      {/* CR manquants */}
      {withoutReport.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-warning mb-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-warning inline-block" />
            <span>Comptes rendus manquants</span>
          </h2>
          <div className="space-y-1.5">
            {withoutReport.map((e) => (
              <div key={e.id} className="flex items-center justify-between bg-warning-soft border border-warning/30 rounded-lg px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-ink">{e.title}</p>
                  <p className="text-xs text-ink-muted">{fmt(e.date)} · {EVENT_TYPE_LABELS[e.type] ?? e.type}</p>
                </div>
                <Link
                  href={`/admin/events/${e.id}/report`}
                  className={`${buttonClasses("ghost", "sm")} shrink-0 ml-2`}
                >
                  Rédiger →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CR rédigés */}
      {withReport.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-ink-muted mb-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-success inline-block" />
            <span>Comptes rendus rédigés</span>
          </h2>
          <div className="bg-surface border border-line rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-sunken text-left">
                  <th className="px-4 py-2.5 text-xs font-medium text-ink-muted">Événement</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-ink-muted hidden md:table-cell">Prédicateur</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-ink-muted hidden md:table-cell">Message</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-ink-muted">Sections</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {withReport.map((e) => (
                  <tr key={e.id} className="hover:bg-surface-sunken transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/admin/events/${e.id}/report`} className="font-medium text-ink hover:text-brand-text transition-colors">
                        {e.title}
                      </Link>
                      <p className="text-xs text-ink-subtle mt-0.5">{fmt(e.date)}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-muted hidden md:table-cell">
                      {e.report?.speaker ?? <span className="text-ink-subtle">—</span>}
                    </td>
                    <td className="px-4 py-3 text-ink-muted hidden md:table-cell truncate max-w-[200px]">
                      {e.report?.messageTitle ?? <span className="text-ink-subtle">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs text-success bg-success-soft px-2 py-0.5 rounded-full">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        {e.report?.sections.length ?? 0} section{(e.report?.sections.length ?? 0) > 1 ? "s" : ""}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Événements sans CR activé */}
      {notEnabled.length > 0 && (
        <p className="text-xs text-ink-subtle italic">
          {notEnabled.length} événement{notEnabled.length > 1 ? "s" : ""} sans compte rendu activé sur la période.
        </p>
      )}

      {events.length === 0 && (
        <p className="text-sm text-ink-subtle italic">Aucun événement passé sur les 3 derniers mois.</p>
      )}
    </div>
  );
}
