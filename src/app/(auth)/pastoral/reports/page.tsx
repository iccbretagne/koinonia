import { auth, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";

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
        <Link href="/pastoral" className="text-sm text-gray-400 hover:text-icc-violet transition-colors">
          ← Accueil pastoral
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Comptes rendus</h1>
        <p className="text-sm text-gray-500 mt-0.5">{church?.name} · 3 derniers mois</p>
      </div>

      {/* Résumé */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{withReport.length}</p>
          <p className="text-xs text-gray-500 mt-1">CR rédigés</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className={`text-2xl font-bold ${withoutReport.length > 0 ? "text-amber-600" : "text-gray-400"}`}>{withoutReport.length}</p>
          <p className="text-xs text-gray-500 mt-1">En attente</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-400">{events.length}</p>
          <p className="text-xs text-gray-500 mt-1">Événements total</p>
        </div>
      </div>

      {/* CR manquants */}
      {withoutReport.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            Comptes rendus manquants
          </h2>
          <div className="space-y-1.5">
            {withoutReport.map((e) => (
              <div key={e.id} className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-800">{e.title}</p>
                  <p className="text-xs text-gray-500">{fmt(e.date)} · {EVENT_TYPE_LABELS[e.type] ?? e.type}</p>
                </div>
                <Link
                  href={`/admin/events/${e.id}/report`}
                  className="text-xs text-icc-violet hover:underline shrink-0 ml-2"
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
          <h2 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            Comptes rendus rédigés
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Événement</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 hidden md:table-cell">Prédicateur</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 hidden md:table-cell">Message</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Sections</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {withReport.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/admin/events/${e.id}/report`} className="font-medium text-gray-800 hover:text-icc-violet transition-colors">
                        {e.title}
                      </Link>
                      <p className="text-xs text-gray-400 mt-0.5">{fmt(e.date)}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                      {e.report?.speaker ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell truncate max-w-[200px]">
                      {e.report?.messageTitle ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
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
        <p className="text-xs text-gray-400 italic">
          {notEnabled.length} événement{notEnabled.length > 1 ? "s" : ""} sans compte rendu activé sur la période.
        </p>
      )}

      {events.length === 0 && (
        <p className="text-sm text-gray-400 italic">Aucun événement passé sur les 3 derniers mois.</p>
      )}
    </div>
  );
}
