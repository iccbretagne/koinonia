"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportSection {
  label: string;
  stats: Record<string, number> | null;
}

interface EventReport {
  id: string;
  updatedAt: string;
  hasContent: boolean;
  sections: ReportSection[];
}

interface EventItem {
  id: string;
  title: string;
  date: string;
  type: string;
  statsEnabled: boolean;
  report: EventReport | null;
}

interface Props {
  events: EventItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function norm(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function getAccueilStats(sections: ReportSection[]) {
  const s = sections.find((s) => norm(s.label) === "accueil");
  if (!s?.stats) return null;
  const hommes = s.stats["hommes"] ?? 0;
  const femmes = s.stats["femmes"] ?? 0;
  const enfants = s.stats["enfants"] ?? 0;
  return { hommes, femmes, enfants, adultes: hommes + femmes, total: hommes + femmes + enfants };
}

function getIntegrationStats(sections: ReportSection[]) {
  const s = sections.find((s) => norm(s.label).startsWith("int") && norm(s.label).includes("gration"));
  if (!s?.stats) return null;
  return {
    hommes: s.stats["hommes"] ?? 0,
    femmes: s.stats["femmes"] ?? 0,
    passage: s.stats["passage"] ?? 0,
    convertis: s.stats["convertis"] ?? 0,
    voeux: s.stats["voeux"] ?? 0,
  };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Composant ────────────────────────────────────────────────────────────────

type Tab = "list" | "stats";

export default function ReportsClient({ events }: Props) {
  const [tab, setTab] = useState<Tab>("list");
  const [monthFilter, setMonthFilter] = useState<string>("all");

  // Mois disponibles (YYYY-MM)
  const availableMonths = useMemo(() => {
    const months = new Set(events.map((e) => e.date.slice(0, 7)));
    return Array.from(months).sort().reverse();
  }, [events]);

  // Événements filtrés (onglet stats)
  const filteredEvents = useMemo(() => {
    if (monthFilter === "all") return events;
    return events.filter((e) => e.date.startsWith(monthFilter));
  }, [events, monthFilter]);

  // Agrégation stats Accueil
  const accueilAgg = useMemo(() => {
    const withStats = filteredEvents.filter((e) => e.statsEnabled && e.report);
    const rows = withStats.map((e) => getAccueilStats(e.report!.sections)).filter(Boolean) as NonNullable<ReturnType<typeof getAccueilStats>>[];
    if (!rows.length) return null;
    const sum = rows.reduce((acc, r) => ({
      hommes: acc.hommes + r.hommes,
      femmes: acc.femmes + r.femmes,
      enfants: acc.enfants + r.enfants,
      adultes: acc.adultes + r.adultes,
      total: acc.total + r.total,
    }), { hommes: 0, femmes: 0, enfants: 0, adultes: 0, total: 0 });
    return { ...sum, count: rows.length, avgAdultes: Math.round(sum.adultes / rows.length), avgTotal: Math.round(sum.total / rows.length) };
  }, [filteredEvents]);

  // Agrégation stats Intégration
  const integrationAgg = useMemo(() => {
    const withStats = filteredEvents.filter((e) => e.statsEnabled && e.report);
    const rows = withStats.map((e) => getIntegrationStats(e.report!.sections)).filter(Boolean) as NonNullable<ReturnType<typeof getIntegrationStats>>[];
    if (!rows.length) return null;
    return rows.reduce((acc, r) => ({
      hommes: acc.hommes + r.hommes,
      femmes: acc.femmes + r.femmes,
      passage: acc.passage + r.passage,
      convertis: acc.convertis + r.convertis,
      voeux: acc.voeux + r.voeux,
    }), { hommes: 0, femmes: 0, passage: 0, convertis: 0, voeux: 0 });
  }, [filteredEvents]);

  const totalEvents = filteredEvents.length;
  const withReport = filteredEvents.filter((e) => e.report?.hasContent).length;
  const pending = totalEvents - filteredEvents.filter((e) => e.report !== null).length;

  return (
    <div>
      {/* Onglets */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(["list", "stats"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-icc-violet text-icc-violet"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "list" ? "Liste des CRs" : "Statistiques"}
          </button>
        ))}
      </div>

      {/* ── Onglet Liste ──────────────────────────────────────────────────── */}
      {tab === "list" && (
        <div className="space-y-3">
          {events.length === 0 && (
            <p className="text-center text-gray-400 py-12">
              Aucun événement avec compte rendu activé.
            </p>
          )}
          {events.map((event) => {
            const status = !event.report
              ? "none"
              : event.report.hasContent
              ? "done"
              : "empty";

            const accueil = event.report ? getAccueilStats(event.report.sections) : null;

            return (
              <div key={event.id} className="bg-white rounded-lg border border-gray-100 shadow-sm px-5 py-4 flex items-center gap-4 flex-wrap">
                {/* Statut */}
                <span className={`shrink-0 w-2 h-2 rounded-full ${status === "done" ? "bg-green-500" : status === "empty" ? "bg-amber-400" : "bg-gray-200"}`} />

                {/* Infos événement */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{event.title}</p>
                  <p className="text-xs text-gray-400">
                    {fmtDate(event.date)} · {event.type}
                    {event.report && (
                      <span className="ml-2 text-gray-300">· Modifié {fmtDateTime(event.report.updatedAt)}</span>
                    )}
                  </p>
                </div>

                {/* Mini stats Accueil si disponibles */}
                {accueil && (
                  <div className="flex gap-3 text-xs text-gray-500 shrink-0">
                    <span className="text-blue-600 font-medium">{accueil.hommes}H</span>
                    <span className="text-pink-600 font-medium">{accueil.femmes}F</span>
                    <span className="font-semibold text-gray-700">{accueil.total} total</span>
                  </div>
                )}

                {/* Badge + action */}
                <div className="flex items-center gap-2 shrink-0">
                  {status === "done" && <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">Complété</span>}
                  {status === "empty" && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">Vide</span>}
                  {status === "none" && <span className="text-xs bg-gray-50 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full font-medium">Aucun CR</span>}
                  <Link
                    href={`/admin/events/${event.id}/report`}
                    className="text-xs font-medium text-icc-violet hover:underline"
                  >
                    {status === "none" ? "Saisir →" : "Voir / Modifier →"}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Onglet Statistiques ───────────────────────────────────────────── */}
      {tab === "stats" && (
        <div className="space-y-6">
          {/* Filtre période */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Période :</label>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="border-2 border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet"
            >
              <option value="all">Toute la période</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {new Date(m + "-01").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-400">
              {withReport}/{totalEvents} événements avec CR · {pending} en attente
            </span>
          </div>

          {/* Bloc Présence (Accueil) */}
          {accueilAgg ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-blue-50 border-b border-blue-100">
                <h3 className="text-sm font-semibold text-blue-800">Présence au culte (Accueil)</h3>
                <p className="text-xs text-blue-600 mt-0.5">{accueilAgg.count} culte{accueilAgg.count > 1 ? "s" : ""} avec statistiques</p>
              </div>
              <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Hommes (total)",   value: accueilAgg.hommes,    sub: `moy. ${Math.round(accueilAgg.hommes / accueilAgg.count)}/culte`,   color: "text-blue-600" },
                  { label: "Femmes (total)",    value: accueilAgg.femmes,    sub: `moy. ${Math.round(accueilAgg.femmes / accueilAgg.count)}/culte`,   color: "text-pink-600" },
                  { label: "Adultes (total)",   value: accueilAgg.adultes,   sub: `moy. ${accueilAgg.avgAdultes}/culte`,   color: "text-icc-violet" },
                  { label: "Général (total)",   value: accueilAgg.total,     sub: `moy. ${accueilAgg.avgTotal}/culte`,     color: "text-gray-700" },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-gray-500 mt-1">{s.label}</div>
                    <div className="text-xs text-gray-400">{s.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">Aucune donnée Accueil sur cette période.</p>
          )}

          {/* Bloc Intégration */}
          {integrationAgg ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-green-50 border-b border-green-100">
                <h3 className="text-sm font-semibold text-green-800">Intégration</h3>
              </div>
              <div className="p-5 grid grid-cols-2 sm:grid-cols-5 gap-4">
                {[
                  { label: "Nouveaux (H)", value: integrationAgg.hommes,    color: "text-blue-600" },
                  { label: "Nouveaux (F)", value: integrationAgg.femmes,    color: "text-pink-600" },
                  { label: "De passage",   value: integrationAgg.passage,   color: "text-gray-600" },
                  { label: "Convertis",    value: integrationAgg.convertis, color: "text-green-600" },
                  { label: "Renouvellement vœux", value: integrationAgg.voeux, color: "text-icc-violet" },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-gray-500 mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">Aucune donnée Intégration sur cette période.</p>
          )}

          {/* Détail par événement */}
          {withReport > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700">Détail par événement</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <th className="px-4 py-2 text-left font-medium">Événement</th>
                      <th className="px-4 py-2 text-center font-medium">H</th>
                      <th className="px-4 py-2 text-center font-medium">F</th>
                      <th className="px-4 py-2 text-center font-medium">Enfants</th>
                      <th className="px-4 py-2 text-center font-medium">Total adultes</th>
                      <th className="px-4 py-2 text-center font-medium">Total général</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredEvents.filter((e) => e.report?.hasContent).map((e) => {
                      const acc = getAccueilStats(e.report!.sections);
                      return (
                        <tr key={e.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <Link href={`/admin/events/${e.id}/report`} className="text-icc-violet hover:underline font-medium">
                              {e.title}
                            </Link>
                            <span className="text-gray-400 ml-2">{fmtDate(e.date)}</span>
                          </td>
                          <td className="px-4 py-2 text-center text-blue-600 font-medium">{acc?.hommes ?? "—"}</td>
                          <td className="px-4 py-2 text-center text-pink-600 font-medium">{acc?.femmes ?? "—"}</td>
                          <td className="px-4 py-2 text-center">{acc?.enfants ?? "—"}</td>
                          <td className="px-4 py-2 text-center font-semibold">{acc?.adultes ?? "—"}</td>
                          <td className="px-4 py-2 text-center font-semibold text-gray-700">{acc?.total ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
