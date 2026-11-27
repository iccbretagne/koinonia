import { requirePastoralActiveChurch } from "../active-church";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { PageHeader, StatusChip, buttonClasses } from "@/components/ui";
import { rolePermissions } from "@/lib/registry";
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
  const { session, activeChurchId } = await requirePastoralActiveChurch();

  // Le compte rendu (`/admin/events/[id]/report`) n'est ouvert qu'avec `events:manage` ou
  // `reports:view` dans l'église de l'événement : sans ce droit, la ligne n'est pas un lien
  // (spec 092 — jamais de lien vers un refus ; la lecture pastorale arrive au lot 3).
  const perms = new Set(
    session.user.churchRoles
      .filter((r) => r.churchId === activeChurchId)
      .flatMap((r) => rolePermissions[r.role] ?? [])
  );
  const canOpenReport = perms.has("events:manage") || perms.has("reports:view");

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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">

      <PageHeader title="Comptes rendus" description={`${church?.name ?? ""} · 3 derniers mois`} />

      {/* Résumé */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <p className="text-2xl font-bold text-success">{withReport.length}</p>
          <p className="text-xs text-ink-muted mt-1">{withReport.length > 1 ? "CR rédigés" : "CR rédigé"}</p>
        </div>
        <div className="text-center">
          <p className={`text-2xl font-bold ${withoutReport.length > 0 ? "text-warning" : "text-ink-muted"}`}>{withoutReport.length}</p>
          <p className="text-xs text-ink-muted mt-1">En attente</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-ink">{events.length}</p>
          <p className="text-xs text-ink-muted mt-1">{events.length > 1 ? "Événements au total" : "Événement au total"}</p>
        </div>
      </div>

      {/* CR manquants */}
      {withoutReport.length > 0 && (
        <div>
          <h2 className="mb-2 flex items-center gap-2 font-display text-[17px] font-semibold text-ink">
            Comptes rendus manquants
            <StatusChip tone="warning">{withoutReport.length}</StatusChip>
          </h2>
          <div className="flex flex-col gap-2">
            {withoutReport.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-2.5 shadow-card">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{e.title}</p>
                  <p className="text-xs text-ink-muted">{fmt(e.date)} · {EVENT_TYPE_LABELS[e.type] ?? e.type}</p>
                </div>
                {canOpenReport && (
                  <Link
                    href={`/admin/events/${e.id}/report`}
                    className={`${buttonClasses("secondary", "sm")} shrink-0`}
                  >
                    Rédiger le CR
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CR rédigés */}
      {withReport.length > 0 && (
        <div>
          <h2 className="mb-2 font-display text-[17px] font-semibold text-ink">Comptes rendus rédigés</h2>
          <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
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
                  <tr key={e.id} className="transition-colors hover:bg-surface-sunken">
                    <td className="px-4 py-3">
                      {canOpenReport ? (
                        <Link href={`/admin/events/${e.id}/report`} className="inline-flex min-h-11 items-center gap-1 rounded-control font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0">
                          {e.title}
                          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" strokeWidth={1.75} />
                        </Link>
                      ) : (
                        <span className="font-medium text-ink">{e.title}</span>
                      )}
                      <p className="text-xs text-ink-subtle mt-0.5">{fmt(e.date)}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-muted hidden md:table-cell">
                      {e.report?.speaker ?? <span className="text-ink-subtle">—</span>}
                    </td>
                    <td className="px-4 py-3 text-ink-muted hidden md:table-cell truncate max-w-[200px]">
                      {e.report?.messageTitle ?? <span className="text-ink-subtle">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip tone="success" icon={Check}>
                        {e.report?.sections.length ?? 0} section{(e.report?.sections.length ?? 0) > 1 ? "s" : ""}
                      </StatusChip>
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
        <p className="text-xs text-ink-muted">
          {notEnabled.length} événement{notEnabled.length > 1 ? "s" : ""} sans compte rendu activé sur la période.
        </p>
      )}

      {events.length === 0 && (
        <p className="text-sm text-ink-muted">Aucun événement passé sur les 3 derniers mois.</p>
      )}
    </div>
  );
}
