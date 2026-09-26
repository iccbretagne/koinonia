"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import DataTable from "@/components/ui/DataTable";
import CheckboxGroup from "@/components/ui/CheckboxGroup";
import { isAbsencePast } from "@/lib/absence-lock";
import { ROLE_SHORT_LABELS } from "@/lib/roles";
import AbsencesTimeline from "./AbsencesTimeline";

type StatusFilter = "ACTIVE" | "ALL" | "CANCELLED";
type SortOption = "startDateDesc" | "startDateAsc" | "member";
type ViewMode = "table" | "timeline";

function memberName(a: { member: { firstName: string; lastName: string } }): string {
  return `${a.member.firstName} ${a.member.lastName}`;
}

function ConflictBadge({ hasConflict }: { readonly hasConflict: boolean }) {
  return hasConflict ? <span className="text-orange-700 font-medium">⚠ Conflit planning</span> : <>—</>;
}

function StatusBadge({ status }: { readonly status: "ACTIVE" | "CANCELLED" }) {
  return status === "ACTIVE" ? (
    <span className="text-green-700 font-medium">Active</span>
  ) : (
    <span className="text-gray-400">Annulée</span>
  );
}

function BackupList({ backups }: { readonly backups: { name: string }[] }) {
  return backups.length > 0 ? <>{backups.map((b) => b.name).join(", ")}</> : <>—</>;
}

interface MemberRef {
  id: string;
  firstName: string;
  lastName: string;
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

interface BackupOption {
  value: string;
  label: string;
}

interface TargetOptionEvent {
  id: string;
  title: string;
  date: string;
  departmentIds: string[];
}

interface TargetOptions {
  departments: { id: string; name: string; selectable: boolean }[];
  events: TargetOptionEvent[];
}

function RadioPills({
  name,
  options,
  value,
  onChange,
}: {
  readonly name: string;
  readonly options: { value: string; label: string }[];
  readonly value: string;
  readonly onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-full border text-sm cursor-pointer transition-colors ${
            value === opt.value
              ? "bg-icc-violet text-white border-icc-violet"
              : "border-gray-300 text-gray-700 hover:border-icc-violet"
          }`}
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="sr-only"
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

function eventDateFmt(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

function monthGroupLabel(iso: string): string {
  const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(iso));
  return label.charAt(0).toUpperCase() + label.slice(1);
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
          <span className="line-through text-gray-400">{first.title}</span> (événement supprimé)
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

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

function isEditable(a: AbsenceRow): boolean {
  if (a.status !== "ACTIVE") return false;
  const { end } = effectiveRange(a);
  return !isAbsencePast(end.toISOString());
}

function parseBackupSelection(selected: string[]): { type: "STAR" | "RESPONSIBLE"; memberId?: string; userChurchRoleId?: string }[] {
  return selected.map((value) => {
    const [type, id] = value.split(":");
    return type === "STAR" ? { type: "STAR" as const, memberId: id } : { type: "RESPONSIBLE" as const, userChurchRoleId: id };
  });
}

export default function AbsencesClient({
  churchId,
  canView,
  canManage,
  selfMembers,
  manageableMembers,
  ministries,
  departments,
  canDesignateBackup,
  backupOptions,
}: AbsencesClientProps) {
  const [selfAbsences, setSelfAbsences] = useState<AbsenceRow[]>([]);
  const [allAbsences, setAllAbsences] = useState<AbsenceRow[]>([]);
  const [loadingSelf, setLoadingSelf] = useState(true);
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

  const [declareOpen, setDeclareOpen] = useState(false);
  const [declareMode, setDeclareMode] = useState<"self" | "manage">("self");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingIsSelf, setEditingIsSelf] = useState(false);
  const [formMemberId, setFormMemberId] = useState("");
  const [formKind, setFormKind] = useState<"PERIOD" | "EVENTS">("PERIOD");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formEventIds, setFormEventIds] = useState<string[]>([]);
  const [formAllDepartments, setFormAllDepartments] = useState(true);
  const [formDepartmentIds, setFormDepartmentIds] = useState<string[]>([]);
  const [formReason, setFormReason] = useState("");
  const [formBackups, setFormBackups] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [manageBackupEligible, setManageBackupEligible] = useState(false);
  const [manageBackupOptions, setManageBackupOptions] = useState<BackupOption[]>([]);
  const [loadingManageBackupOptions, setLoadingManageBackupOptions] = useState(false);
  const [targetOptions, setTargetOptions] = useState<TargetOptions>({ departments: [], events: [] });
  const [loadingTargetOptions, setLoadingTargetOptions] = useState(false);
  const [deselectedEventsMessage, setDeselectedEventsMessage] = useState<string | null>(null);

  const fetchSelf = useCallback(async () => {
    setLoadingSelf(true);
    try {
      const res = await fetch(`/api/absences?churchId=${churchId}&scope=self`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSelfAbsences(data.absences);
    } catch {
      setError("Erreur lors du chargement de vos absences.");
    } finally {
      setLoadingSelf(false);
    }
  }, [churchId]);

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
    } catch {
      setError("Erreur lors du chargement de la vue transverse.");
    } finally {
      setLoadingAll(false);
    }
  }, [churchId, canView, ministryFilter, departmentFilter, roleFilter]);

  useEffect(() => {
    fetchSelf();
  }, [fetchSelf]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!declareOpen || declareMode !== "manage" || !formMemberId) {
      setManageBackupEligible(false);
      setManageBackupOptions([]);
      return;
    }
    let cancelled = false;
    setLoadingManageBackupOptions(true);
    fetch(`/api/absences/backup-options?churchId=${churchId}&memberId=${formMemberId}`)
      .then((res) => (res.ok ? res.json() : { eligible: false, options: [] }))
      .then((data) => {
        if (cancelled) return;
        setManageBackupEligible(!!data.eligible);
        setManageBackupOptions(data.options ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setManageBackupEligible(false);
          setManageBackupOptions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingManageBackupOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [declareOpen, declareMode, formMemberId, churchId]);

  useEffect(() => {
    if (!declareOpen || !formMemberId) {
      setTargetOptions({ departments: [], events: [] });
      return;
    }
    let cancelled = false;
    setLoadingTargetOptions(true);
    fetch(`/api/absences/target-options?churchId=${churchId}&memberId=${formMemberId}`)
      .then((res) => (res.ok ? res.json() : { departments: [], events: [] }))
      .then((data) => {
        if (!cancelled) setTargetOptions({ departments: data.departments ?? [], events: data.events ?? [] });
      })
      .catch(() => {
        if (!cancelled) setTargetOptions({ departments: [], events: [] });
      })
      .finally(() => {
        if (!cancelled) setLoadingTargetOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [declareOpen, formMemberId, churchId]);

  const eligibleEvents = useMemo(() => {
    if (formAllDepartments) return targetOptions.events;
    return targetOptions.events.filter((e) => e.departmentIds.some((id) => formDepartmentIds.includes(id)));
  }, [targetOptions.events, formAllDepartments, formDepartmentIds]);

  useEffect(() => {
    if (formKind !== "EVENTS") return;
    const eligibleIds = new Set(eligibleEvents.map((e) => e.id));
    const kept = formEventIds.filter((id) => eligibleIds.has(id));
    if (kept.length !== formEventIds.length) {
      setFormEventIds(kept);
      setDeselectedEventsMessage(
        `${formEventIds.length - kept.length} événement(s) décoché(s) : hors des départements sélectionnés.`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibleEvents]);

  const eventsByMonth = useMemo(() => {
    const groups = new Map<string, TargetOptionEvent[]>();
    for (const e of [...eligibleEvents].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())) {
      const key = monthGroupLabel(e.date);
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    return Array.from(groups.entries());
  }, [eligibleEvents]);

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

  const hasScrolledToHighlight = useRef(false);
  useEffect(() => {
    if (!highlightId || hasScrolledToHighlight.current) return;
    const el = document.getElementById(`row-${highlightId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    hasScrolledToHighlight.current = true;
  }, [highlightId, displayedAbsences]);

  function resetForm() {
    setFormKind("PERIOD");
    setFormStartDate("");
    setFormEndDate("");
    setFormEventIds([]);
    setFormAllDepartments(true);
    setFormDepartmentIds([]);
    setFormReason("");
    setFormBackups([]);
    setFormError(null);
    setDeselectedEventsMessage(null);
  }

  function openDeclareForSelf() {
    setEditingId(null);
    setDeclareMode("self");
    setFormMemberId(selfMembers[0]?.id ?? "");
    resetForm();
    setDeclareOpen(true);
  }

  function openDeclareForOther() {
    setEditingId(null);
    setDeclareMode("manage");
    setFormMemberId("");
    resetForm();
    setDeclareOpen(true);
  }

  function openEdit(a: AbsenceRow, isSelf: boolean) {
    setEditingId(a.id);
    setEditingIsSelf(isSelf);
    setDeclareMode(isSelf ? "self" : "manage");
    setFormMemberId(a.member.id);
    setFormKind(a.kind);
    setFormStartDate(a.startDate ? toDateInputValue(a.startDate) : "");
    setFormEndDate(a.endDate ? toDateInputValue(a.endDate) : "");
    setFormEventIds(a.targetEvents.filter((e) => !e.deleted && e.eventId).map((e) => e.eventId!));
    setFormAllDepartments(a.allDepartments);
    setFormDepartmentIds(a.targetDepartments.map((d) => d.id));
    setFormReason(a.reason ?? "");
    setFormBackups(a.backups.map((b) => `${b.type}:${b.targetId}`));
    setFormError(null);
    setDeselectedEventsMessage(null);
    setDeclareOpen(true);
  }

  function onStartDateChange(value: string) {
    setFormStartDate(value);
    if (!formEndDate || formEndDate < value) setFormEndDate(value);
  }

  async function submitForm() {
    if (!editingId && !formMemberId) {
      setFormError("Choisir une fiche STAR.");
      return;
    }
    if (formKind === "PERIOD" && (!formStartDate || !formEndDate)) {
      setFormError("Date de début et date de fin sont requises.");
      return;
    }
    if (formKind === "EVENTS" && formEventIds.length === 0) {
      setFormError("Sélectionner au moins un événement.");
      return;
    }
    if (!formAllDepartments && formDepartmentIds.length === 0) {
      setFormError("Sélectionner au moins un département.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const includeBackups =
        declareMode === "self"
          ? canDesignateBackup && (!editingId || editingIsSelf)
          : manageBackupEligible;
      const backups = includeBackups ? parseBackupSelection(formBackups) : undefined;

      const targeting = {
        kind: formKind,
        ...(formKind === "PERIOD"
          ? { startDate: new Date(formStartDate).toISOString(), endDate: new Date(formEndDate).toISOString() }
          : { eventIds: formEventIds }),
        allDepartments: formAllDepartments,
        ...(formAllDepartments ? {} : { departmentIds: formDepartmentIds }),
      };

      const res = editingId
        ? await fetch(`/api/absences/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "update",
              ...targeting,
              reason: formReason || null,
              ...(backups ? { backups } : {}),
            }),
          })
        : await fetch("/api/absences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              churchId,
              memberId: formMemberId,
              ...targeting,
              reason: formReason || null,
              ...(backups ? { backups } : {}),
            }),
          });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erreur lors de l'enregistrement");
      }
      setDeclareOpen(false);
      await Promise.all([fetchSelf(), fetchAll()]);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelAbsence(id: string) {
    if (!confirm("Annuler définitivement cette absence ?")) return;
    try {
      const res = await fetch(`/api/absences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) throw new Error();
      await Promise.all([fetchSelf(), fetchAll()]);
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
        body: JSON.stringify({ churchId, absenceIds: displayedAbsences.map((a) => a.id) }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `absences-${new Date().toISOString().slice(0, 10)}.xlsx`;
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

  const activeAbsences = selfAbsences.filter((a) => a.status === "ACTIVE");
  const visibleDepartments = ministryFilter
    ? departments.filter((d) => d.ministryId === ministryFilter)
    : departments;
  const showBackupField =
    declareMode === "self"
      ? canDesignateBackup && (!editingId || editingIsSelf)
      : manageBackupEligible;
  const activeBackupOptions = declareMode === "self" ? backupOptions : manageBackupOptions;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Absences</h1>

      {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}

      {selfMembers.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Mes absences</h2>
            <Button size="sm" onClick={openDeclareForSelf}>Déclarer une absence</Button>
          </div>
          {loadingSelf ? (
            <p className="text-gray-500 text-sm">Chargement...</p>
          ) : (
            <DataTable
              data={activeAbsences}
              emptyMessage="Aucune absence déclarée."
              columns={[
                { header: "Quand", accessor: (a) => <WhenCell a={a} /> },
                { header: "Départements", accessor: (a) => formatDepartments(a) },
                { header: "Motif", accessor: (a) => a.reason ?? "—" },
                { header: "Backup(s)", accessor: (a) => <BackupList backups={a.backups} /> },
                {
                  header: "Conflit",
                  accessor: (a) => <ConflictBadge hasConflict={a.hasConflict} />,
                },
              ]}
              actions={(a) => (
                <div className="flex gap-2 justify-end">
                  {isEditable(a) && (
                    <Button size="sm" variant="secondary" onClick={() => openEdit(a, true)}>
                      Modifier
                    </Button>
                  )}
                  {isEditable(a) && (
                    <Button size="sm" variant="danger" onClick={() => cancelAbsence(a.id)}>
                      Annuler
                    </Button>
                  )}
                </div>
              )}
            />
          )}
        </section>
      )}

      {canView && (
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-gray-900">Vue d&apos;ensemble</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex border-2 border-gray-300 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`px-3 py-1.5 text-sm ${viewMode === "table" ? "bg-icc-violet text-white" : "bg-white text-gray-600"}`}
                >
                  Tableau
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("timeline")}
                  className={`px-3 py-1.5 text-sm ${viewMode === "timeline" ? "bg-icc-violet text-white" : "bg-white text-gray-600"}`}
                >
                  Frise
                </button>
              </div>
              <Button size="sm" variant="secondary" onClick={exportAbsences} disabled={exporting}>
                {exporting ? "Export..." : "Exporter"}
              </Button>
              {canManage && (
                <Button size="sm" onClick={openDeclareForOther}>Déclarer pour un STAR</Button>
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

          {loadingAll ? (
            <p className="text-gray-500 text-sm">Chargement...</p>
          ) : viewMode === "timeline" ? (
            <AbsencesTimeline absences={displayedAbsences} onSelect={selectFromTimeline} />
          ) : (
            <DataTable
              data={displayedAbsences}
              highlightedId={highlightId}
              emptyMessage="Aucune absence ne correspond à ces filtres."
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
                { header: "Backup(s)", accessor: (a) => <BackupList backups={a.backups} /> },
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
                          {isEditable(a) && (
                            <Button size="sm" variant="secondary" onClick={() => openEdit(a, false)}>
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
          )}
        </section>
      )}

      <Modal
        open={declareOpen}
        onClose={() => setDeclareOpen(false)}
        title={editingId ? "Modifier l'absence" : declareMode === "self" ? "Déclarer une absence" : "Déclarer pour un STAR"}
      >
        <div className="space-y-4">
          {!editingId && declareMode === "self" && selfMembers.length > 1 && (
            <Select
              label="Fiche STAR"
              value={formMemberId}
              onChange={(e) => setFormMemberId(e.target.value)}
              options={selfMembers.map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` }))}
            />
          )}
          {!editingId && declareMode === "manage" && (
            <Select
              label="STAR"
              placeholder="Sélectionner..."
              value={formMemberId}
              onChange={(e) => {
                setFormMemberId(e.target.value);
                setFormBackups([]);
              }}
              options={manageableMembers.map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` }))}
            />
          )}

          <div className="space-y-2">
            <span className="block text-sm font-medium text-gray-700">Quand ?</span>
            <RadioPills
              name="formKind"
              value={formKind}
              onChange={(v) => setFormKind(v as "PERIOD" | "EVENTS")}
              options={[
                { value: "PERIOD", label: "Une période" },
                { value: "EVENTS", label: "Des événements précis" },
              ]}
            />

            {formKind === "PERIOD" ? (
              <div className="space-y-3 pt-1">
                <Input
                  type="date"
                  label="Date de début"
                  value={formStartDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                />
                <Input
                  type="date"
                  label="Date de fin"
                  value={formEndDate}
                  min={formStartDate || undefined}
                  onChange={(e) => setFormEndDate(e.target.value)}
                />
              </div>
            ) : (
              <div className="pt-1 space-y-2">
                {loadingTargetOptions ? (
                  <p className="text-xs text-gray-400">Chargement des événements...</p>
                ) : eventsByMonth.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucun événement disponible.</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto border-2 border-gray-300 rounded-lg p-2 space-y-3">
                    {eventsByMonth.map(([month, events]) => (
                      <div key={month}>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-1">
                          {month}
                        </p>
                        <div className="space-y-1">
                          {events.map((ev) => (
                            <label
                              key={ev.id}
                              className="flex items-start gap-2 px-2 py-2 min-h-[44px] rounded text-sm hover:bg-gray-50 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={formEventIds.includes(ev.id)}
                                onChange={() =>
                                  setFormEventIds((prev) =>
                                    prev.includes(ev.id) ? prev.filter((id) => id !== ev.id) : [...prev, ev.id]
                                  )
                                }
                                className="mt-0.5 shrink-0 rounded border-gray-300 text-icc-violet focus:ring-icc-violet"
                              />
                              <span className="min-w-0 break-words leading-snug">
                                {ev.title} — {eventDateFmt(ev.date)}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {deselectedEventsMessage && <p className="text-xs text-orange-600">{deselectedEventsMessage}</p>}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <span className="block text-sm font-medium text-gray-700">Pour quels départements ?</span>
            <RadioPills
              name="formAllDepartments"
              value={formAllDepartments ? "ALL" : "SOME"}
              onChange={(v) => {
                setFormAllDepartments(v === "ALL");
                setDeselectedEventsMessage(null);
              }}
              options={[
                { value: "ALL", label: "Tous mes départements" },
                { value: "SOME", label: "Certains départements" },
              ]}
            />
            {!formAllDepartments && (
              <CheckboxGroup
                label="Départements visés"
                options={targetOptions.departments
                  .filter((d) => d.selectable)
                  .map((d) => ({ value: d.id, label: d.name }))}
                selected={formDepartmentIds}
                onChange={setFormDepartmentIds}
              />
            )}
          </div>

          <Input
            label="Motif (optionnel)"
            value={formReason}
            onChange={(e) => setFormReason(e.target.value)}
          />

          {declareMode === "manage" && loadingManageBackupOptions && (
            <p className="text-xs text-gray-400">Vérification du backup possible...</p>
          )}
          {showBackupField && activeBackupOptions.length > 0 && (
            <CheckboxGroup
              label="Backup (optionnel)"
              options={activeBackupOptions}
              selected={formBackups}
              onChange={setFormBackups}
            />
          )}

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeclareOpen(false)}>Annuler</Button>
            <Button onClick={submitForm} disabled={submitting}>
              {submitting ? "Envoi..." : editingId ? "Enregistrer" : "Déclarer"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
