"use client";

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  VALIDATED: "Confiée",
  SCHEDULED: "Planifiée",
  CLOSED: "Terminée",
  REJECTED: "Refusée",
};

const APPOINTMENT_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-warning",
  VALIDATED: "bg-info",
  SCHEDULED: "bg-success",
  CLOSED: "bg-control-line",
  REJECTED: "bg-danger",
};

const APPOINTMENT_STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-warning-soft text-warning border-warning/30",
  VALIDATED: "bg-info-soft text-info border-info/30",
  SCHEDULED: "bg-success-soft text-success border-success/30",
  CLOSED: "bg-surface-sunken text-ink-muted border-line",
  REJECTED: "bg-danger-soft text-danger border-danger/30",
};

const APPOINTMENT_FUNNEL_STATUSES = ["PENDING", "VALIDATED", "SCHEDULED", "CLOSED"] as const;

// Miroir client de REJECT_REASON_LABELS (appointment-state.ts) — un composant client ne peut
// pas importer l'index du module, qui tire des dépendances serveur.
const REJECT_REASON_LABELS: Record<string, string> = {
  OUT_OF_SCOPE: "Hors du champ pastoral",
  DUPLICATE: "Doublon",
  WITHDRAWN: "Retirée par la personne",
  UNREACHABLE: "Injoignable",
  REDIRECTED: "Orientée ailleurs",
  OTHER: "Autre",
};

const MSDP_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Appel reçu",
  ASSIGNED: "Référent assigné",
  CONTACTED: "Contacté",
  IN_FORMATION: "En formation",
  COMPLETED: "Terminé",
  ABANDONED: "Abandonné",
};

const MSDP_STATUS_COLORS: Record<string, string> = {
  SUBMITTED: "bg-warning",
  ASSIGNED: "bg-info",
  CONTACTED: "bg-info",
  IN_FORMATION: "bg-brand",
  COMPLETED: "bg-success",
  ABANDONED: "bg-danger",
};

const MSDP_STATUS_BADGE: Record<string, string> = {
  SUBMITTED: "bg-warning-soft text-warning border-warning/30",
  ASSIGNED: "bg-info-soft text-info border-info/30",
  CONTACTED: "bg-info-soft text-info border-info/30",
  IN_FORMATION: "bg-brand-soft text-brand-text border-brand/30",
  COMPLETED: "bg-success-soft text-success border-success/30",
  ABANDONED: "bg-danger-soft text-danger border-danger/30",
};

const MSDP_FUNNEL_STATUSES = ["SUBMITTED", "ASSIGNED", "CONTACTED", "IN_FORMATION", "COMPLETED"] as const;

const MONTH_NAMES = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

interface AppointmentStats {
  total: number;
  byStatus: { status: string; count: number }[];
  byAssignee: { name: string; count: number }[];
  byRejectReason: { reasonCode: string; count: number }[];
}

interface MsdpStats {
  salvationCalls: number;
  total: number;
  byStatus: { status: string; count: number }[];
  completed: number;
  abandoned: number;
  completionRate: number | null;
  avgDaysToContact: number | null;
  avgDaysToCompletion: number | null;
  byMonth: { month: string; count: number }[];
  journeyMilestones: { integratedInFamily: number; followsPcnc: number; isStar: number; inDiscipleship: number };
}

interface Props {
  readonly appointments: AppointmentStats;
  readonly msdp: MsdpStats;
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly sub?: string;
  readonly accent?: boolean;
}) {
  return (
    <div className={`bg-surface rounded-xl border p-4 sm:p-5 ${accent ? "border-brand/30 bg-brand-soft" : "border-line"}`}>
      <p className="text-xs text-ink-muted font-medium mb-1">{label}</p>
      <p className={`text-3xl font-bold ${accent ? "text-brand-text" : "text-ink"}`}>{value}</p>
      {sub && <p className="text-xs text-ink-subtle mt-1">{sub}</p>}
    </div>
  );
}

function BarChart({ data, total }: { readonly data: { label: string; count: number }[]; readonly total: number }) {
  if (data.length === 0) return <p className="text-sm text-ink-subtle">Aucune donnée</p>;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="text-xs text-ink-muted w-28 shrink-0 truncate">{d.label}</span>
          <div className="flex-1 bg-surface-sunken rounded-full h-2">
            <div
              className="bg-brand rounded-full h-2 transition-all"
              style={{ width: `${Math.round((d.count / max) * 100)}%` }}
            />
          </div>
          <span className="text-xs font-medium text-ink-muted w-8 text-right shrink-0">{d.count}</span>
          <span className="text-xs text-ink-subtle w-8 text-right shrink-0">
            {total > 0 ? `${Math.round((d.count / total) * 100)}%` : "–"}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function CareStatsView({ appointments, msdp }: Props) {
  const apptStatusMap = Object.fromEntries(appointments.byStatus.map((r) => [r.status, r.count]));

  return (
    <div className="space-y-8">
      {/* ── Section Rendez-vous pastoraux ────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-ink">Rendez-vous pastoraux</h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="Total" value={appointments.total} />
          <KpiCard label="En attente" value={apptStatusMap["PENDING"] ?? 0} />
          <KpiCard label="Confiées" value={apptStatusMap["VALIDATED"] ?? 0} />
          <KpiCard label="Planifiées" value={apptStatusMap["SCHEDULED"] ?? 0} accent />
          <KpiCard label="Refusées" value={apptStatusMap["REJECTED"] ?? 0} />
        </div>

        {appointments.total === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-6 text-center text-sm text-ink-subtle">
            Aucune demande de rendez-vous pastoral pour l&apos;instant.
          </div>
        ) : (
          <>
            <div className="bg-surface rounded-xl border border-line p-5">
              <h3 className="font-semibold text-ink mb-4">Entonnoir de progression</h3>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
                {APPOINTMENT_FUNNEL_STATUSES.map((s) => {
                  const count = apptStatusMap[s] ?? 0;
                  const pct = appointments.total > 0 ? Math.round((count / appointments.total) * 100) : 0;
                  return (
                    <div key={s} className="flex-1 flex flex-col items-center gap-1.5">
                      <span className="text-sm font-bold text-ink">{count}</span>
                      <div className="w-full bg-surface-sunken rounded-lg overflow-hidden h-20 sm:h-auto sm:w-full sm:min-h-[20px]">
                        <div
                          className={`${APPOINTMENT_STATUS_COLORS[s]} rounded-lg transition-all`}
                          style={{ height: `${Math.max(pct, 4)}%`, minHeight: "8px" }}
                        />
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${APPOINTMENT_STATUS_BADGE[s]}`}>
                        {APPOINTMENT_STATUS_LABELS[s]}
                      </span>
                      <span className="text-xs text-ink-subtle">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-surface rounded-xl border border-line p-5">
                <h3 className="font-semibold text-ink mb-4">Par référent</h3>
                <BarChart
                  data={appointments.byAssignee.map((a) => ({ label: a.name, count: a.count }))}
                  total={appointments.total}
                />
              </div>
              <div className="bg-surface rounded-xl border border-line p-5">
                <h3 className="font-semibold text-ink mb-4">Motifs de rejet</h3>
                <BarChart
                  data={appointments.byRejectReason.map((r) => ({
                    label: REJECT_REASON_LABELS[r.reasonCode] ?? r.reasonCode,
                    count: r.count,
                  }))}
                  total={apptStatusMap["REJECTED"] ?? 0}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Section MSDP (reprise, spec 052 lot 3) ──────────────────────────── */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-ink">Suivi MSDP</h2>
          <span className="text-xs px-2.5 py-1 rounded-full bg-brand-soft text-brand-text font-medium">
            Nouveaux convertis
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Appels au salut" value={msdp.salvationCalls} sub="total reçus" />
          <KpiCard label="Suivis démarrés" value={msdp.total} sub={msdp.salvationCalls > 0 ? `${Math.round((msdp.total / msdp.salvationCalls) * 100)}% des appels` : undefined} />
          <KpiCard label="Terminés" value={msdp.completed} accent />
          <KpiCard label="Abandonnés" value={msdp.abandoned} />
          <KpiCard
            label="Taux complétion"
            value={msdp.completionRate !== null ? `${msdp.completionRate}%` : "–"}
            sub="terminés / suivis"
          />
          <KpiCard
            label="Délai 1er contact"
            value={msdp.avgDaysToContact !== null ? `${msdp.avgDaysToContact}j` : "–"}
            sub="appel → contact"
          />
        </div>

        {msdp.total === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-6 text-center text-sm text-ink-subtle">
            Aucun suivi MSDP démarré. Les suivis apparaissent ici une fois créés depuis une demande avec appel au salut.
          </div>
        ) : (
          <>
            <div className="bg-surface rounded-xl border border-line p-5">
              <h3 className="font-semibold text-ink mb-4">Entonnoir MSDP</h3>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
                {MSDP_FUNNEL_STATUSES.map((s) => {
                  const count = msdp.byStatus.find((r) => r.status === s)?.count ?? 0;
                  const pct = msdp.total > 0 ? Math.round((count / msdp.total) * 100) : 0;
                  return (
                    <div key={s} className="flex-1 flex flex-col items-center gap-1.5">
                      <span className="text-sm font-bold text-ink">{count}</span>
                      <div className="w-full bg-surface-sunken rounded-lg overflow-hidden h-20 sm:h-auto sm:w-full sm:min-h-[20px]">
                        <div
                          className={`${MSDP_STATUS_COLORS[s]} rounded-lg transition-all`}
                          style={{ height: `${Math.max(pct, 4)}%`, minHeight: "8px" }}
                        />
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${MSDP_STATUS_BADGE[s]}`}>
                        {MSDP_STATUS_LABELS[s]}
                      </span>
                      <span className="text-xs text-ink-subtle">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-surface rounded-xl border border-line p-5">
                <h3 className="font-semibold text-ink mb-4">Suivis démarrés par mois (12 derniers mois)</h3>
                {msdp.byMonth.every((m) => m.count === 0) ? (
                  <p className="text-sm text-ink-subtle">Aucun suivi sur la période</p>
                ) : (() => {
                  const maxMonth = Math.max(...msdp.byMonth.map((m) => m.count), 1);
                  return (
                    <div className="flex items-end gap-1.5 h-28">
                      {msdp.byMonth.map((m) => {
                        const height = Math.max(Math.round((m.count / maxMonth) * 100), m.count > 0 ? 4 : 0);
                        const [year, month] = m.month.split("-");
                        const label = `${MONTH_NAMES[Number.parseInt(month) - 1]} ${year.slice(2)}`;
                        return (
                          <div key={m.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                            <span className="text-xs text-ink-muted font-medium">{m.count > 0 ? m.count : ""}</span>
                            <div className="w-full bg-brand rounded-t-md transition-all" style={{ height: `${height}%`, minHeight: m.count > 0 ? "4px" : "0" }} />
                            <span className="text-[10px] text-ink-subtle leading-tight text-center">{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              <div className="bg-surface rounded-xl border border-line p-5 space-y-4">
                <h3 className="font-semibold text-ink">Jalons parcours (dossiers actifs)</h3>
                <div className="space-y-3">
                  {[
                    { label: "Intégré en famille", value: msdp.journeyMilestones.integratedInFamily },
                    { label: "Devenu STAR", value: msdp.journeyMilestones.isStar },
                    { label: "Suit le PCNC", value: msdp.journeyMilestones.followsPcnc },
                    { label: "En discipolat", value: msdp.journeyMilestones.inDiscipleship },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="text-xs text-ink-muted w-36 shrink-0">{label}</span>
                      <div className="flex-1 bg-surface-sunken rounded-full h-2">
                        <div
                          className="bg-brand rounded-full h-2 transition-all"
                          style={{ width: msdp.total > 0 ? `${Math.round((value / msdp.total) * 100)}%` : "0%" }}
                        />
                      </div>
                      <span className="text-xs font-medium text-ink-muted w-6 text-right shrink-0">{value}</span>
                      <span className="text-xs text-ink-subtle w-8 text-right shrink-0">
                        {msdp.total > 0 ? `${Math.round((value / msdp.total) * 100)}%` : "–"}
                      </span>
                    </div>
                  ))}
                  {msdp.avgDaysToCompletion !== null && (
                    <div className="pt-2 border-t border-line">
                      <p className="text-xs text-ink-muted font-medium">Délai moyen appel → clôture</p>
                      <p className="text-2xl font-bold text-brand-text mt-0.5">{msdp.avgDaysToCompletion}j</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
