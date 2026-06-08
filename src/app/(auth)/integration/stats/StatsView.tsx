"use client";

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Soumise",
  ASSIGNED: "Affectée",
  CONTACTED: "Contactée",
  WHATSAPP_ADDED: "WhatsApp famille",
  INTEGRATED: "Intégrée",
  ABANDONED: "Abandonnée",
};

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: "bg-gray-400",
  ASSIGNED: "bg-blue-400",
  CONTACTED: "bg-yellow-400",
  WHATSAPP_ADDED: "bg-green-400",
  INTEGRATED: "bg-icc-violet",
  ABANDONED: "bg-red-400",
};

const STATUS_BADGE: Record<string, string> = {
  SUBMITTED: "bg-gray-100 text-gray-700 border-gray-200",
  ASSIGNED: "bg-blue-50 text-blue-700 border-blue-200",
  CONTACTED: "bg-yellow-50 text-yellow-700 border-yellow-200",
  WHATSAPP_ADDED: "bg-green-50 text-green-700 border-green-200",
  INTEGRATED: "bg-icc-violet/10 text-icc-violet border-icc-violet/20",
  ABANDONED: "bg-red-50 text-red-700 border-red-200",
};

const AGE_LABELS: Record<string, string> = {
  YOUTH: "−18 ans",
  YOUNG_ADULT: "18–30 ans",
  ADULT: "30–60 ans",
  SENIOR: "60+ ans",
};

const CHURCH_STATUS_LABELS: Record<string, string> = {
  VISITOR: "Visiteur",
  REGULAR: "Régulier",
  ENGAGED: "Engagé",
};

const FUNNEL_STATUSES = ["SUBMITTED", "ASSIGNED", "CONTACTED", "WHATSAPP_ADDED", "INTEGRATED"] as const;

const MSDP_STATUS_LABELS: Record<string, string> = {
  SUBMITTED:    "Appel reçu",
  ASSIGNED:     "Conseiller assigné",
  CONTACTED:    "Contacté",
  IN_FORMATION: "En formation",
  COMPLETED:    "Terminé",
  ABANDONED:    "Abandonné",
};

const MSDP_STATUS_COLORS: Record<string, string> = {
  SUBMITTED:    "bg-amber-400",
  ASSIGNED:     "bg-blue-400",
  CONTACTED:    "bg-indigo-400",
  IN_FORMATION: "bg-purple-400",
  COMPLETED:    "bg-emerald-500",
  ABANDONED:    "bg-red-400",
};

const MSDP_STATUS_BADGE: Record<string, string> = {
  SUBMITTED:    "bg-amber-50 text-amber-700 border-amber-200",
  ASSIGNED:     "bg-blue-50 text-blue-700 border-blue-200",
  CONTACTED:    "bg-indigo-50 text-indigo-700 border-indigo-200",
  IN_FORMATION: "bg-purple-50 text-purple-700 border-purple-200",
  COMPLETED:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  ABANDONED:    "bg-red-50 text-red-700 border-red-200",
};

const MSDP_FUNNEL_STATUSES = ["SUBMITTED", "ASSIGNED", "CONTACTED", "IN_FORMATION", "COMPLETED"] as const;

const MONTH_NAMES = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

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
  total: number;
  pending: number;
  integrated: number;
  abandoned: number;
  conversionRate: number | null;
  avgDaysToIntegration: number | null;
  byStatus: { status: string; count: number }[];
  byFamily: { familyId: number | null; familyName: string; count: number }[];
  byAgeRange: { ageRange: string; count: number }[];
  byChurchStatus: { churchStatus: string; count: number }[];
  byMonth: { month: string; count: number }[];
  pastoralCare: number;
  msdp: MsdpStats;
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border p-4 sm:p-5 ${accent ? "border-icc-violet/30 bg-icc-violet/5" : "border-gray-200"}`}>
      <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
      <p className={`text-3xl font-bold ${accent ? "text-icc-violet" : "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function BarChart({ data, total }: { data: { label: string; count: number }[]; total: number }) {
  if (total === 0) return <p className="text-sm text-gray-400">Aucune donnée</p>;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-24 shrink-0 truncate">{d.label}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-2">
            <div
              className="bg-icc-violet rounded-full h-2 transition-all"
              style={{ width: `${Math.round((d.count / max) * 100)}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-700 w-8 text-right shrink-0">{d.count}</span>
          <span className="text-xs text-gray-400 w-8 text-right shrink-0">
            {total > 0 ? `${Math.round((d.count / total) * 100)}%` : "–"}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function StatsView({
  total,
  pending,
  integrated,
  abandoned,
  conversionRate,
  avgDaysToIntegration,
  byStatus,
  byFamily,
  byAgeRange,
  byChurchStatus,
  byMonth,
  pastoralCare,
  msdp,
}: Props) {
  const statusMap = Object.fromEntries(byStatus.map((r) => [r.status, r.count]));
  const maxMonth = Math.max(...byMonth.map((m) => m.count), 1);

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total" value={total} />
        <KpiCard label="En cours" value={pending} sub="actives" />
        <KpiCard label="Intégrées" value={integrated} accent />
        <KpiCard label="Abandonnées" value={abandoned} />
        <KpiCard
          label="Taux conversion"
          value={conversionRate !== null ? `${conversionRate}%` : "–"}
          sub="intégrées / total"
        />
        <KpiCard
          label="Délai moyen"
          value={avgDaysToIntegration !== null ? `${avgDaysToIntegration}j` : "–"}
          sub="soumission → intégration"
        />
      </div>

      {/* Funnel */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Entonnoir de progression</h2>
        {total === 0 ? (
          <p className="text-sm text-gray-400">Aucune donnée</p>
        ) : (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
            {FUNNEL_STATUSES.map((s, i) => {
              const count = statusMap[s] ?? 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={s} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-sm font-bold text-gray-900">{count}</span>
                  <div className="w-full bg-gray-100 rounded-lg overflow-hidden h-20 sm:h-auto sm:w-full sm:min-h-[20px]">
                    <div
                      className={`${STATUS_COLORS[s]} rounded-lg transition-all`}
                      style={{ height: `${Math.max(pct, 4)}%`, minHeight: "8px" }}
                    />
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE[s]}`}>
                    {STATUS_LABELS[s]}
                  </span>
                  <span className="text-xs text-gray-400">{pct}%</span>
                  {i < FUNNEL_STATUSES.length - 1 && (
                    <span className="hidden sm:block text-gray-300 text-lg absolute">→</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tendance mensuelle */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Demandes par mois (12 derniers mois)</h2>
        {byMonth.every((m) => m.count === 0) ? (
          <p className="text-sm text-gray-400">Aucune demande sur la période</p>
        ) : (
          <div className="flex items-end gap-1.5 h-28">
            {byMonth.map((m) => {
              const height = Math.max(Math.round((m.count / maxMonth) * 100), m.count > 0 ? 4 : 0);
              const [year, month] = m.month.split("-");
              const label = `${MONTH_NAMES[parseInt(month) - 1]} ${year.slice(2)}`;
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <span className="text-xs text-gray-600 font-medium">{m.count > 0 ? m.count : ""}</span>
                  <div
                    className="w-full bg-icc-violet rounded-t-md transition-all"
                    style={{ height: `${height}%`, minHeight: m.count > 0 ? "4px" : "0" }}
                  />
                  <span className="text-[10px] text-gray-400 rotate-0 leading-tight text-center">{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Par famille */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-1">
          <h2 className="font-semibold text-gray-900 mb-4">Par famille (top 10)</h2>
          {byFamily.length === 0 ? (
            <p className="text-sm text-gray-400">Aucune affectation</p>
          ) : (
            <BarChart
              data={byFamily.map((f) => ({ label: f.familyName, count: f.count }))}
              total={byFamily.reduce((s, f) => s + f.count, 0)}
            />
          )}
        </div>

        {/* Par tranche d'âge */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Tranche d&apos;âge</h2>
          <BarChart
            data={byAgeRange.map((r) => ({ label: AGE_LABELS[r.ageRange] ?? r.ageRange, count: r.count }))}
            total={total}
          />
        </div>

        {/* Par statut église + soins pastoraux */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
          <div>
            <h2 className="font-semibold text-gray-900 mb-4">Situation à l&apos;église</h2>
            <BarChart
              data={byChurchStatus.map((r) => ({
                label: CHURCH_STATUS_LABELS[r.churchStatus] ?? r.churchStatus,
                count: r.count,
              }))}
              total={total}
            />
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-500 font-medium mb-1">Soins pastoraux demandés</p>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold text-amber-600">{pastoralCare}</span>
              <span className="text-sm text-gray-400 mb-0.5">
                {total > 0 ? `(${Math.round((pastoralCare / total) * 100)}% des demandes)` : ""}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Statuts abandonnés en bas */}
      {abandoned > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-red-700">
            <span className="font-semibold">{abandoned} demande{abandoned > 1 ? "s" : ""} abandonnée{abandoned > 1 ? "s" : ""}</span>
            {" "}— consultez la liste des demandes pour analyser les raisons d&apos;abandon.
          </p>
        </div>
      )}

      {/* ── Section MSDP ──────────────────────────────────────────────────── */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">Suivi MSDP</h2>
          <span className="text-xs px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">
            Nouveaux convertis
          </span>
        </div>

        {/* KPI row MSDP */}
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
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
            Aucun suivi MSDP démarré. Les suivis apparaissent ici une fois créés depuis une demande avec appel au salut.
          </div>
        ) : (
          <>
            {/* Entonnoir MSDP */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Entonnoir MSDP</h3>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
                {MSDP_FUNNEL_STATUSES.map((s) => {
                  const count = msdp.byStatus.find((r) => r.status === s)?.count ?? 0;
                  const pct = msdp.total > 0 ? Math.round((count / msdp.total) * 100) : 0;
                  return (
                    <div key={s} className="flex-1 flex flex-col items-center gap-1.5">
                      <span className="text-sm font-bold text-gray-900">{count}</span>
                      <div className="w-full bg-gray-100 rounded-lg overflow-hidden h-20 sm:h-auto sm:w-full sm:min-h-[20px]">
                        <div
                          className={`${MSDP_STATUS_COLORS[s]} rounded-lg transition-all`}
                          style={{ height: `${Math.max(pct, 4)}%`, minHeight: "8px" }}
                        />
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${MSDP_STATUS_BADGE[s]}`}>
                        {MSDP_STATUS_LABELS[s]}
                      </span>
                      <span className="text-xs text-gray-400">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom row MSDP */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Tendance mensuelle MSDP */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-4">Suivis démarrés par mois (12 derniers mois)</h3>
                {msdp.byMonth.every((m) => m.count === 0) ? (
                  <p className="text-sm text-gray-400">Aucun suivi sur la période</p>
                ) : (() => {
                  const msdpMaxMonth = Math.max(...msdp.byMonth.map((m) => m.count), 1);
                  return (
                    <div className="flex items-end gap-1.5 h-28">
                      {msdp.byMonth.map((m) => {
                        const height = Math.max(Math.round((m.count / msdpMaxMonth) * 100), m.count > 0 ? 4 : 0);
                        const [year, month] = m.month.split("-");
                        const label = `${MONTH_NAMES[parseInt(month) - 1]} ${year.slice(2)}`;
                        return (
                          <div key={m.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                            <span className="text-xs text-gray-600 font-medium">{m.count > 0 ? m.count : ""}</span>
                            <div className="w-full bg-purple-500 rounded-t-md transition-all" style={{ height: `${height}%`, minHeight: m.count > 0 ? "4px" : "0" }} />
                            <span className="text-[10px] text-gray-400 leading-tight text-center">{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Résultats jalons parcours */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <h3 className="font-semibold text-gray-900">Jalons parcours (dossiers actifs)</h3>
                {msdp.total === 0 ? (
                  <p className="text-sm text-gray-400">Aucun suivi démarré</p>
                ) : (
                  <div className="space-y-3">
                    {[
                      { label: "Intégré en famille", value: msdp.journeyMilestones.integratedInFamily },
                      { label: "Devenu STAR", value: msdp.journeyMilestones.isStar },
                      { label: "Suit le PCNC", value: msdp.journeyMilestones.followsPcnc },
                      { label: "En discipolat", value: msdp.journeyMilestones.inDiscipleship },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-36 shrink-0">{label}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-purple-500 rounded-full h-2 transition-all"
                            style={{ width: msdp.total > 0 ? `${Math.round((value / msdp.total) * 100)}%` : "0%" }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-700 w-6 text-right shrink-0">{value}</span>
                        <span className="text-xs text-gray-400 w-8 text-right shrink-0">
                          {msdp.total > 0 ? `${Math.round((value / msdp.total) * 100)}%` : "–"}
                        </span>
                      </div>
                    ))}
                    {msdp.avgDaysToCompletion !== null && (
                      <div className="pt-2 border-t border-gray-100">
                        <p className="text-xs text-gray-500 font-medium">Délai moyen appel → clôture</p>
                        <p className="text-2xl font-bold text-purple-700 mt-0.5">{msdp.avgDaysToCompletion}j</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
