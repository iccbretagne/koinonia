"use client";

import { useId, useState, useMemo } from "react";
import Link from "next/link";
import { FileDown } from "lucide-react";
import { Button, EmptyState, Input, SearchInput, Select, StatusChip, buttonClasses, controlClasses, useToast } from "@/components/ui";
import Tabs, { TabPanel } from "@/components/ui/Tabs";
import { paths } from "@/lib/paths";

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
  readonly events: EventItem[];
  readonly churchId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function reportStatus(report: EventReport | null): "none" | "done" | "empty" {
  if (!report) return "none";
  return report.hasContent ? "done" : "empty";
}


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

function getSainteCeneStats(sections: ReportSection[]) {
  const s = sections.find((s) => norm(s.label).includes("sainte") && norm(s.label).includes("cene"));
  if (!s?.stats) return null;
  return {
    supportsUtilises: s.stats["supportsUtilises"] ?? 0,
    supportsRestants: s.stats["supportsRestants"] ?? 0,
  };
}

function getNavetteStats(sections: ReportSection[]) {
  const s = sections.find((s) => norm(s.label).includes("navette"));
  if (!s?.stats) return null;
  const hommes = s.stats["hommes"] ?? 0;
  const femmes = s.stats["femmes"] ?? 0;
  const enfants = s.stats["enfants"] ?? 0;
  return { hommes, femmes, enfants, total: hommes + femmes + enfants };
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

export default function ReportsClient({ events, churchId }: Props) {
  const uid = useId();
  const [tab, setTab] = useState<Tab>("list");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [exportFrom, setExportFrom] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [exportTo, setExportTo] = useState<string>(() => {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  });
  const [exporting, setExporting] = useState(false);
  const [listMonthFilter, setListMonthFilter] = useState<string>(() => {
    // Default to current month
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    // Use current month if events exist for it, otherwise "all"
    return events.some((e) => e.date.startsWith(currentMonth)) ? currentMonth : "all";
  });
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const toast = useToast();

  // Mois disponibles (YYYY-MM)
  const availableMonths = useMemo(() => {
    const months = new Set(events.map((e) => e.date.slice(0, 7)));
    return Array.from(months).sort((a, b) => a.localeCompare(b));
  }, [events]);

  // Types d'événements disponibles
  const availableTypes = useMemo(() => {
    const types = new Set(events.map((e) => e.type));
    return Array.from(types).sort((a, b) => a.localeCompare(b));
  }, [events]);

  // Événements filtrés (onglet liste)
  const filteredListEvents = useMemo(() => {
    let filtered = events;
    if (listMonthFilter !== "all") {
      filtered = filtered.filter((e) => e.date.startsWith(listMonthFilter));
    }
    if (typeFilter !== "all") {
      filtered = filtered.filter((e) => e.type === typeFilter);
    }
    if (statusFilter !== "all") {
      filtered = filtered.filter((e) => {
        return reportStatus(e.report) === statusFilter;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((e) => e.title.toLowerCase().includes(q));
    }
    return filtered;
  }, [events, listMonthFilter, typeFilter, statusFilter, searchQuery]);

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

  // Agrégation stats Sainte Cène
  const sainteCeneAgg = useMemo(() => {
    const rows = filteredEvents
      .filter((e) => e.statsEnabled && e.report)
      .map((e) => getSainteCeneStats(e.report!.sections))
      .filter(Boolean) as NonNullable<ReturnType<typeof getSainteCeneStats>>[];
    if (!rows.length) return null;
    return rows.reduce((acc, r) => ({
      supportsUtilises: acc.supportsUtilises + r.supportsUtilises,
      supportsRestants: acc.supportsRestants + r.supportsRestants,
    }), { supportsUtilises: 0, supportsRestants: 0 });
  }, [filteredEvents]);

  // Agrégation stats Navette
  const navetteAgg = useMemo(() => {
    const rows = filteredEvents
      .filter((e) => e.statsEnabled && e.report)
      .map((e) => getNavetteStats(e.report!.sections))
      .filter(Boolean) as NonNullable<ReturnType<typeof getNavetteStats>>[];
    if (!rows.length) return null;
    const sum = rows.reduce((acc, r) => ({
      hommes: acc.hommes + r.hommes,
      femmes: acc.femmes + r.femmes,
      enfants: acc.enfants + r.enfants,
      total: acc.total + r.total,
    }), { hommes: 0, femmes: 0, enfants: 0, total: 0 });
    return { ...sum, count: rows.length, avgTotal: Math.round(sum.total / rows.length) };
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
      <Tabs
        ariaLabel="Comptes rendus"
        idBase="reports"
        value={tab}
        onChange={setTab}
        className="mb-6"
        tabs={[
          { value: "list", label: "Liste des comptes rendus" },
          { value: "stats", label: "Statistiques" },
        ]}
      />

      <TabPanel idBase="reports" value={tab}>
      {/* ── Onglet Liste ──────────────────────────────────────────────────── */}
      {tab === "list" && (
        <div className="flex flex-col gap-4">
          {/* Filtres */}
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput
              aria-label="Rechercher un événement"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un événement…"
              className="min-w-[200px] max-w-xs flex-1"
            />
            <select
              aria-label="Mois"
              value={listMonthFilter}
              onChange={(e) => setListMonthFilter(e.target.value)}
              className={`${controlClasses()} w-full sm:w-auto`}
            >
              <option value="all">Tous les mois</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {new Date(m + "-01").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                </option>
              ))}
            </select>
            <select
              aria-label="Type d'événement"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={`${controlClasses()} w-full sm:w-auto`}
            >
              <option value="all">Tous les types</option>
              {availableTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              aria-label="Statut du compte rendu"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`${controlClasses()} w-full sm:w-auto`}
            >
              <option value="all">Tous les statuts</option>
              <option value="done">Complété</option>
              <option value="empty">Vide</option>
              <option value="none">Aucun compte rendu</option>
            </select>
            <span className="ml-auto text-[13px] leading-[18px] text-ink-muted">
              {filteredListEvents.length}/{events.length} événement{events.length > 1 ? "s" : ""}
            </span>
          </div>

          {/* Liste */}
          <div className="flex flex-col gap-3">
            {filteredListEvents.map((event) => {
              const status = reportStatus(event.report);

              const accueil = event.report ? getAccueilStats(event.report.sections) : null;

              return (
                <div key={event.id} className="flex flex-wrap items-center gap-4 rounded-card border border-line bg-surface px-5 py-4 shadow-card">
                  {/* Infos événement */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold leading-[22px] text-ink">{event.title}</p>
                    <p className="text-[13px] leading-[18px] text-ink-muted">
                      {fmtDate(event.date)} · {event.type}
                      {event.report && (
                        <span className="ml-2">· Modifié {fmtDateTime(event.report.updatedAt)}</span>
                      )}
                    </p>
                  </div>

                  {/* Mini stats Accueil si disponibles */}
                  {accueil && (
                    <div className="flex shrink-0 gap-3 text-[13px] text-ink-muted">
                      <span>{accueil.hommes} H</span>
                      <span>{accueil.femmes} F</span>
                      <span className="font-semibold text-ink">{accueil.total} au total</span>
                    </div>
                  )}

                  {/* Badge + action */}
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {status === "done" && <StatusChip tone="success">Complété</StatusChip>}
                    {status === "empty" && <StatusChip tone="warning">Vide</StatusChip>}
                    {status === "none" && <StatusChip>Aucun compte rendu</StatusChip>}
                    <Link
                      href={paths.admin.eventReport(event.id)}
                      className={buttonClasses("secondary", "sm")}
                    >
                      {status === "none" ? "Saisir le compte rendu" : "Ouvrir le compte rendu"}
                    </Link>
                  </div>
                </div>
              );
            })}
            {filteredListEvents.length === 0 && (
              <EmptyState
                title={events.length === 0 ? "Aucun événement avec compte rendu activé" : "Aucun événement ne correspond aux filtres"}
                description={events.length === 0 ? "Activez le compte rendu dans la configuration d'un événement." : "Modifiez la recherche ou les filtres."}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Onglet Statistiques ───────────────────────────────────────────── */}
      {tab === "stats" && (
        <div className="flex flex-col gap-6">
          {/* Filtre période */}
          <div className="flex flex-wrap items-end gap-3">
            <Select
              id={`${uid}-period`}
              label="Période"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              options={[
                { value: "all", label: "Toute la période" },
                ...availableMonths.map((m) => ({
                  value: m,
                  label: new Date(m + "-01").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
                })),
              ]}
            />
            <span className="pb-3 text-[13px] leading-[18px] text-ink-muted">
              {withReport}/{totalEvents} événement{totalEvents > 1 ? "s" : ""} avec compte rendu · {pending} en attente
            </span>
          </div>

          {/* Export Excel */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex flex-1 gap-3">
              <Input id={`${uid}-export-from`} label="Du" type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} className="flex-1" />
              <Input id={`${uid}-export-to`} label="Au" type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} className="flex-1" />
            </div>
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={exporting}
              onClick={async () => {
                setExporting(true);
                try {
                  const params = new URLSearchParams({ churchId, from: exportFrom, to: exportTo });
                  const res = await fetch(`/api/events/reports/export?${params}`);
                  if (!res.ok) throw new Error("Erreur lors de l'export");
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "export.xlsx";
                  a.click();
                  URL.revokeObjectURL(url);
                } catch {
                  toast.error("Erreur lors de l'export Excel");
                } finally {
                  setExporting(false);
                }
              }}
            >
              <FileDown aria-hidden="true" className="size-4" strokeWidth={1.75} />
              {exporting ? "Export…" : "Exporter en Excel"}
            </Button>
          </div>

          {/* Bloc Présence (Accueil) */}
          {accueilAgg ? (
            <div className="flex flex-col gap-3">
              <div>
                <h3 className="font-display text-[17px] font-semibold leading-6 text-ink">Présence au culte (Accueil)</h3>
                <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">{accueilAgg.count} culte{accueilAgg.count > 1 ? "s" : ""} avec statistiques</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Hommes (total)",   value: accueilAgg.hommes,    sub: `moy. ${Math.round(accueilAgg.hommes / accueilAgg.count)}/culte` },
                  { label: "Femmes (total)",    value: accueilAgg.femmes,    sub: `moy. ${Math.round(accueilAgg.femmes / accueilAgg.count)}/culte` },
                  { label: "Adultes (total)",   value: accueilAgg.adultes,   sub: `moy. ${accueilAgg.avgAdultes}/culte` },
                  { label: "Général (total)",   value: accueilAgg.total,     sub: `moy. ${accueilAgg.avgTotal}/culte` },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <div className="font-display text-3xl font-bold text-ink">{s.value}</div>
                    <div className="mt-1 text-[13px] leading-[18px] text-ink-muted">{s.label}</div>
                    <div className="text-[13px] leading-[18px] text-ink-muted">{s.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState size="sm" title="Aucune donnée Accueil sur cette période." />
          )}

          {/* Bloc Intégration */}
          {integrationAgg ? (
            <div className="flex flex-col gap-3">
              <div>
                <h3 className="font-display text-[17px] font-semibold leading-6 text-ink">Intégration</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {[
                  { label: "Nouveaux (H)", value: integrationAgg.hommes },
                  { label: "Nouveaux (F)", value: integrationAgg.femmes },
                  { label: "De passage",   value: integrationAgg.passage },
                  { label: "Convertis",    value: integrationAgg.convertis },
                  { label: "Renouvellement vœux", value: integrationAgg.voeux },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <div className="font-display text-3xl font-bold text-ink">{s.value}</div>
                    <div className="mt-1 text-[13px] leading-[18px] text-ink-muted">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState size="sm" title="Aucune donnée Intégration sur cette période." />
          )}

          {/* Bloc Sainte Cène */}
          {sainteCeneAgg ? (
            <div className="flex flex-col gap-3">
              <div>
                <h3 className="font-display text-[17px] font-semibold leading-6 text-ink">Sainte Cène</h3>
              </div>
              <div className="grid grid-cols-2 gap-4 max-w-xs">
                {[
                  { label: "Supports utilisés", value: sainteCeneAgg.supportsUtilises },
                  { label: "Supports restants",  value: sainteCeneAgg.supportsRestants },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <div className="font-display text-3xl font-bold text-ink">{s.value}</div>
                    <div className="mt-1 text-[13px] leading-[18px] text-ink-muted">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState size="sm" title="Aucune donnée Sainte Cène sur cette période." />
          )}

          {/* Bloc Navette */}
          {navetteAgg ? (
            <div className="flex flex-col gap-3">
              <div>
                <h3 className="font-display text-[17px] font-semibold leading-6 text-ink">Navette</h3>
                <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">{navetteAgg.count} culte{navetteAgg.count > 1 ? "s" : ""} avec statistiques</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Hommes (total)",  value: navetteAgg.hommes,    sub: `moy. ${Math.round(navetteAgg.hommes / navetteAgg.count)}/culte` },
                  { label: "Femmes (total)",  value: navetteAgg.femmes,    sub: `moy. ${Math.round(navetteAgg.femmes / navetteAgg.count)}/culte` },
                  { label: "Enfants (total)", value: navetteAgg.enfants,   sub: `moy. ${Math.round(navetteAgg.enfants / navetteAgg.count)}/culte` },
                  { label: "Total général",   value: navetteAgg.total,     sub: `moy. ${navetteAgg.avgTotal}/culte` },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <div className="font-display text-3xl font-bold text-ink">{s.value}</div>
                    <div className="mt-1 text-[13px] leading-[18px] text-ink-muted">{s.label}</div>
                    <div className="text-[13px] leading-[18px] text-ink-muted">{s.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState size="sm" title="Aucune donnée Navette sur cette période." />
          )}

          {/* Détail par événement */}
          {withReport > 0 && (
            <div className="flex flex-col gap-3">
              <div>
                <h3 className="font-display text-[17px] font-semibold leading-6 text-ink">Détail par événement</h3>
              </div>
              <div className="overflow-x-auto rounded-card border border-line bg-surface">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="bg-surface-sunken text-[13px] text-ink-muted">
                      <th className="px-4 py-2 text-left font-medium">Événement</th>
                      <th className="px-4 py-2 text-center font-medium"><abbr title="Hommes">H</abbr></th>
                      <th className="px-4 py-2 text-center font-medium"><abbr title="Femmes">F</abbr></th>
                      <th className="px-4 py-2 text-center font-medium">Enfants</th>
                      <th className="px-4 py-2 text-center font-medium">Total adultes</th>
                      <th className="px-4 py-2 text-center font-medium">Total général</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filteredEvents.filter((e) => e.report?.hasContent).map((e) => {
                      const acc = getAccueilStats(e.report!.sections);
                      return (
                        <tr key={e.id} className="hover:bg-surface-sunken">
                          <td className="px-4 py-2">
                            <Link
                              href={paths.admin.eventReport(e.id)}
                              className="rounded-control font-semibold text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                            >
                              {e.title}
                            </Link>
                            <span className="ml-2 text-ink-muted">{fmtDate(e.date)}</span>
                          </td>
                          <td className="px-4 py-2 text-center">{acc?.hommes ?? "—"}</td>
                          <td className="px-4 py-2 text-center">{acc?.femmes ?? "—"}</td>
                          <td className="px-4 py-2 text-center">{acc?.enfants ?? "—"}</td>
                          <td className="px-4 py-2 text-center font-semibold">{acc?.adultes ?? "—"}</td>
                          <td className="px-4 py-2 text-center font-semibold text-ink">{acc?.total ?? "—"}</td>
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
      </TabPanel>
    </div>
  );
}
