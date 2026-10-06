"use client";

import AvailabilityTabs from "@/components/AvailabilityTabs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import DataTable from "@/components/ui/DataTable";
import { isAbsencePast } from "@/lib/absence-lock";
import { ROLE_SHORT_LABELS } from "@/lib/roles";
import UnavailabilityPeriodForm, {
  type BackupOption,
  type EditablePeriod,
  type MemberRef,
} from "@/components/UnavailabilityPeriodForm";
import AbsencesTimeline from "./AbsencesTimeline";

type StatusFilter = "ACTIVE" | "ALL" | "CANCELLED";
type SortOption = "startDateDesc" | "startDateAsc" | "member";
type ViewMode = "table" | "timeline";

function memberName(a: { member: { firstName: string; lastName: string } }): string {
  return `${a.member.firstName} ${a.member.lastName}`;
}

function ConflictBadge({ hasConflict }: { readonly hasConflict: boolean }) {
  return hasConflict ? <span className="text-warning font-medium">⚠ Conflit planning</span> : <>—</>;
}

function StatusBadge({ status }: { readonly status: "ACTIVE" | "CANCELLED" }) {
  return status === "ACTIVE" ? (
    <span className="text-success font-medium">Active</span>
  ) : (
    <span className="text-ink-subtle">Annulée</span>
  );
}

function BackupList({ backups }: { readonly backups: { name: string }[] }) {
  return backups.length > 0 ? <>{backups.map((b) => b.name).join(", ")}</> : <>—</>;
}

interface AbsenceBackupRow {
  id: string;
  type: "STAR" | "RESPONSIBLE";
  targetId: string;
  name: string;
  role?: "DEPARTMENT_HEAD" | "MINISTER";
}

interface TargetEventRow {
  eventId: string | null;
  title: string;
  date: string;
  deleted: boolean;
}

interface TargetDepartmentRow {
  id: string;
  name: string;
}

interface AbsenceRow {
  id: string;
  member: {
    id: string;
    firstName: string;
    lastName: string;
    departments: { id: string; name: string; ministry: { id: string; name: string } }[];
  };
  kind: "PERIOD" | "EVENTS";
  startDate: string | null;
  endDate: string | null;
  allDepartments: boolean;
  targetDepartments: TargetDepartmentRow[];
  targetEvents: TargetEventRow[];
  reason: string | null;
  status: "ACTIVE" | "CANCELLED";
  createdAt: string;
  createdBy: { id: string; name: string | null };
  hasConflict: boolean;
  backups: AbsenceBackupRow[];
}

interface ResponseRow {
  id: string;
  member: {
    id: string;
    firstName: string;
    lastName: string;
    departments: { id: string; name: string; ministry: { id: string; name: string } }[];
  };
  event: { id: string; title: string; date: string };
  department: { id: string; name: string };
  enteredBy: string | null;
}

function eventDateFmt(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

/** Fenêtre effective d'une absence pour le tri/filtrage : période déclarée, ou bornes des
 * événements visés encore existants (fallback sur la date de création si tous supprimés). */
function effectiveRange(a: AbsenceRow): { start: Date; end: Date } {
  if (a.kind === "PERIOD" && a.startDate && a.endDate) {
    return { start: new Date(a.startDate), end: new Date(a.endDate) };
  }
  const live = a.targetEvents.filter((e) => !e.deleted).map((e) => new Date(e.date).getTime());
  if (live.length > 0) {
    return { start: new Date(Math.min(...live)), end: new Date(Math.max(...live)) };
  }
  const created = new Date(a.createdAt);
  return { start: created, end: created };
}

function WhenCell({ a }: { readonly a: AbsenceRow }) {
  if (a.kind === "PERIOD") {
    return <>{a.startDate && a.endDate ? `${formatDate(a.startDate)} → ${formatDate(a.endDate)}` : "—"}</>;
  }
  const sorted = [...a.targetEvents].sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime());
  if (sorted.length === 0) return <>—</>;
  const first = sorted[0];
  return (
    <span title={sorted.map((e) => `${e.title} (${eventDateFmt(e.date)})`).join(", ")}>
      {first.deleted ? (
        <>
          <span className="line-through text-ink-subtle">{first.title}</span> (événement supprimé)
        </>
      ) : (
        `${first.title} (${eventDateFmt(first.date)})`
      )}
      {sorted.length > 1 && ` +${sorted.length - 1}`}
    </span>
  );
}

function formatDepartments(a: AbsenceRow): string {
  return a.allDepartments ? "Tous" : a.targetDepartments.map((d) => d.name).join(", ") || "—";
}

interface AbsencesClientProps {
  readonly churchId: string;
  readonly canView: boolean;
  readonly canManage: boolean;
  readonly canSettings: boolean;
  readonly selfMembers: MemberRef[];
  readonly manageableMembers: MemberRef[];
  readonly ministries: { id: string; name: string }[];
  readonly departments: { id: string; name: string; ministryId: string }[];
  readonly canDesignateBackup: boolean;
  readonly backupOptions: BackupOption[];
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

function isEditable(a: AbsenceRow): boolean {
  if (a.status !== "ACTIVE") return false;
  const { end } = effectiveRange(a);
  return !isAbsencePast(end.toISOString());
}

export default function AbsencesClient({
  churchId,
  canView,
  canManage,
  canSettings,
  selfMembers,
  manageableMembers,
  ministries,
  departments,
  canDesignateBackup,
  backupOptions,
}: AbsencesClientProps) {
  const [allAbsences, setAllAbsences] = useState<AbsenceRow[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [loadingAll, setLoadingAll] = useState(canView);
  const [error, setError] = useState<string | null>(null);

  const [ministryFilter, setMinistryFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("startDateDesc");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [timelineHighlightId, setTimelineHighlightId] = useState<string | undefined>(undefined);
  const [exporting, setExporting] = useState(false);

  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlightId") ?? timelineHighlightId;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EditablePeriod | null>(null);

  const fetchAll = useCallback(async () => {
    if (!canView) return;
    setLoadingAll(true);
    try {
      const params = new URLSearchParams({ churchId, scope: "all" });
      if (ministryFilter) params.set("ministryId", ministryFilter);
      if (departmentFilter) params.set("departmentId", departmentFilter);
      if (roleFilter) params.set("role", roleFilter);
      const res = await fetch(`/api/absences?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAllAbsences(data.absences);
      setResponses(data.responses ?? []);
    } catch {
      setError("Erreur lors du chargement des indisponibilités.");
    } finally {
      setLoadingAll(false);
    }
  }, [churchId, canView, ministryFilter, departmentFilter, roleFilter]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const displayedAbsences = useMemo(() => {
    let rows = allAbsences;
    if (statusFilter !== "ALL") {
      rows = rows.filter((a) => a.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((a) => memberName(a).toLowerCase().includes(q));
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      rows = rows.filter((a) => effectiveRange(a).end >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      rows = rows.filter((a) => effectiveRange(a).start <= to);
    }

    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (sortBy === "member") return memberName(a).localeCompare(memberName(b));
      const diff = effectiveRange(a).start.getTime() - effectiveRange(b).start.getTime();
      return sortBy === "startDateAsc" ? diff : -diff;
    });
    return sorted;
  }, [allAbsences, statusFilter, search, dateFrom, dateTo, sortBy]);

  // Les réponses « Pas disponible » suivent les mêmes filtres de recherche et de dates.
  const displayedResponses = useMemo(() => {
    let rows = responses;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => memberName(r).toLowerCase().includes(q));
    }
    if (dateFrom) rows = rows.filter((r) => new Date(r.event.date) >= new Date(dateFrom));
    if (dateTo) rows = rows.filter((r) => new Date(r.event.date) <= new Date(dateTo));
    // La réponse n'a pas de statut « annulée » : masquée quand on ne veut que les annulations.
    return statusFilter === "CANCELLED" ? [] : rows;
  }, [responses, search, dateFrom, dateTo, statusFilter]);

  const hasScrolledToHighlight = useRef(false);
  useEffect(() => {
    if (!highlightId || hasScrolledToHighlight.current) return;
    const el = document.getElementById(`row-${highlightId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    hasScrolledToHighlight.current = true;
  }, [highlightId, displayedAbsences]);

  function openForOther() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(a: AbsenceRow) {
    setEditing({
      id: a.id,
      memberId: a.member.id,
      startDate: a.startDate,
      endDate: a.endDate,
      allDepartments: a.allDepartments,
      departmentIds: a.targetDepartments.map((d) => d.id),
      reason: a.reason,
      backups: a.backups.map((b) => `${b.type}:${b.targetId}`),
      isSelf: selfMembers.some((m) => m.id === a.member.id),
    });
    setFormOpen(true);
  }

  async function cancelAbsence(id: string) {
    if (!confirm("Annuler définitivement cette indisponibilité ?")) return;
    try {
      const res = await fetch(`/api/absences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) throw new Error();
      await fetchAll();
    } catch {
      setError("Erreur lors de l'annulation.");
    }
  }

  async function exportAbsences() {
    setExporting(true);
    try {
      const res = await fetch("/api/absences/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchId,
          absenceIds: displayedAbsences.map((a) => a.id),
          responseIds: displayedResponses.map((r) => r.id),
        }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `indisponibilites-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Erreur lors de l'export.");
    } finally {
      setExporting(false);
    }
  }

  function selectFromTimeline(id: string) {
    setViewMode("table");
    setTimelineHighlightId(id);
  }

  const visibleDepartments = ministryFilter
    ? departments.filter((d) => d.ministryId === ministryFilter)
    : departments;

  return (
    <div className="space-y-8">
      <AvailabilityTabs self={selfMembers.length > 0} team collections={canSettings} />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink">Indisponibilités</h1>
          <p className="text-sm text-ink-muted mt-1">
            Périodes déclarées et réponses « Pas disponible » de votre périmètre.
          </p>
        </div>
      </div>

      {error && <div className="p-3 bg-danger-soft text-danger text-sm rounded-lg">{error}</div>}

      {canView && (
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-ink">Vue d&apos;ensemble</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex border border-control-line rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`px-3 py-1.5 text-sm ${viewMode === "table" ? "bg-brand text-on-brand" : "bg-surface text-ink-muted"}`}
                >
                  Tableau
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("timeline")}
                  className={`px-3 py-1.5 text-sm ${viewMode === "timeline" ? "bg-brand text-on-brand" : "bg-surface text-ink-muted"}`}
                >
                  Frise
                </button>
              </div>
              <Button size="sm" variant="secondary" onClick={exportAbsences} disabled={exporting}>
                {exporting ? "Export..." : "Exporter"}
              </Button>
              {canManage && (
                <Button size="sm" onClick={openForOther}>Déclarer pour un STAR</Button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 min-w-0">
                <Input
                  label="Rechercher un membre"
                  placeholder="Nom, prénom..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="sm:w-48">
                <Select
                  label="Statut"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  options={[
                    { value: "ACTIVE", label: "Actives" },
                    { value: "ALL", label: "Toutes" },
                    { value: "CANCELLED", label: "Annulées" },
                  ]}
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex gap-3 flex-1">
                <div className="w-1/2 sm:w-40">
                  <Input type="date" label="Du" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="w-1/2 sm:w-40">
                  <Input type="date" label="Au" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
              <Select
                label="Ministère"
                placeholder="Tous"
                value={ministryFilter}
                onChange={(e) => {
                  setMinistryFilter(e.target.value);
                  setDepartmentFilter("");
                }}
                options={ministries.map((m) => ({ value: m.id, label: m.name }))}
              />
              <Select
                label="Département"
                placeholder="Tous"
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                options={visibleDepartments.map((d) => ({ value: d.id, label: d.name }))}
              />
              <Select
                label="Rôle du déclarant"
                placeholder="Tous"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                options={[
                  { value: "STAR", label: ROLE_SHORT_LABELS.STAR },
                  { value: "DEPARTMENT_HEAD", label: ROLE_SHORT_LABELS.DEPARTMENT_HEAD },
                  { value: "MINISTER", label: ROLE_SHORT_LABELS.MINISTER },
                ]}
              />
              <div className="sm:ml-auto sm:w-56">
                <Select
                  label="Trier par"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  options={[
                    { value: "startDateDesc", label: "Date de début (récent d'abord)" },
                    { value: "startDateAsc", label: "Date de début (ancien d'abord)" },
                    { value: "member", label: "Nom du membre" },
                  ]}
                />
              </div>
            </div>
          </div>

          {loadingAll && <p className="text-ink-muted text-sm">Chargement...</p>}
          {!loadingAll && viewMode === "timeline" && (
            <AbsencesTimeline absences={displayedAbsences} responses={displayedResponses} onSelect={selectFromTimeline} />
          )}
          {!loadingAll && viewMode !== "timeline" && (
            <>
              <DataTable
                data={displayedAbsences}
                highlightedId={highlightId}
                emptyMessage="Aucune période ne correspond à ces filtres."
                columns={[
                  { header: "Membre", accessor: (a) => memberName(a) },
                  {
                    header: "Département",
                    accessor: (a) => a.member.departments.map((d) => d.name).join(", ") || "—",
                  },
                  {
                    header: "Ministère",
                    accessor: (a) =>
                      Array.from(new Set(a.member.departments.map((d) => d.ministry.name))).join(", ") || "—",
                  },
                  { header: "Quand", accessor: (a) => <WhenCell a={a} /> },
                  { header: "Départements visés", accessor: (a) => formatDepartments(a) },
                  { header: "Remplaçant(s)", accessor: (a) => <BackupList backups={a.backups} /> },
                  { header: "Déclaré par", accessor: (a) => a.createdBy.name ?? "—" },
                  { header: "Statut", accessor: (a) => <StatusBadge status={a.status} /> },
                  {
                    header: "Conflit",
                    accessor: (a) => <ConflictBadge hasConflict={a.hasConflict} />,
                  },
                ]}
                actions={
                  canManage
                    ? (a) =>
                        a.status === "ACTIVE" ? (
                          <div className="flex gap-2 justify-end">
                            {isEditable(a) && a.kind === "PERIOD" && (
                              <Button size="sm" variant="secondary" onClick={() => openEdit(a)}>
                                Modifier
                              </Button>
                            )}
                            {isEditable(a) && (
                              <Button size="sm" variant="danger" onClick={() => cancelAbsence(a.id)}>
                                Annuler
                              </Button>
                            )}
                          </div>
                        ) : null
                    : undefined
                }
              />

              <h3 className="text-base font-semibold text-ink pt-2">Réponses « Pas disponible » à venir</h3>
              <DataTable
                data={displayedResponses}
                emptyMessage="Aucune réponse « Pas disponible » à venir."
                columns={[
                  { header: "Membre", accessor: (r) => memberName(r) },
                  { header: "Département", accessor: (r) => r.department.name },
                  { header: "Événement", accessor: (r) => `${r.event.title} (${eventDateFmt(r.event.date)})` },
                  { header: "Saisi par", accessor: (r) => r.enteredBy ?? "Le STAR" },
                ]}
              />
            </>
          )}
        </section>
      )}

      <UnavailabilityPeriodForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={fetchAll}
        churchId={churchId}
        mode="manage"
        editing={editing}
        selfMembers={selfMembers}
        manageableMembers={manageableMembers}
        canDesignateBackup={canDesignateBackup}
        backupOptions={backupOptions}
      />
    </div>
  );
}
