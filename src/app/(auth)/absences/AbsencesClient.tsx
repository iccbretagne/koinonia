"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import DataTable from "@/components/ui/DataTable";

type StatusFilter = "ACTIVE" | "ALL" | "CANCELLED";
type SortOption = "startDateDesc" | "startDateAsc" | "member";

function memberName(a: { member: { firstName: string; lastName: string } }): string {
  return `${a.member.firstName} ${a.member.lastName}`;
}

function ConflictBadge({ hasConflict }: { hasConflict: boolean }) {
  return hasConflict ? <span className="text-orange-700 font-medium">⚠ Conflit planning</span> : <>—</>;
}

function StatusBadge({ status }: { status: "ACTIVE" | "CANCELLED" }) {
  return status === "ACTIVE" ? (
    <span className="text-green-700 font-medium">Active</span>
  ) : (
    <span className="text-gray-400">Annulée</span>
  );
}

interface MemberRef {
  id: string;
  firstName: string;
  lastName: string;
}

interface AbsenceRow {
  id: string;
  member: {
    id: string;
    firstName: string;
    lastName: string;
    departments: { id: string; name: string; ministry: { id: string; name: string } }[];
  };
  startDate: string;
  endDate: string;
  reason: string | null;
  status: "ACTIVE" | "CANCELLED";
  createdBy: { id: string; name: string | null };
  hasConflict: boolean;
}

interface AbsencesClientProps {
  churchId: string;
  canView: boolean;
  canManage: boolean;
  selfMembers: MemberRef[];
  manageableMembers: MemberRef[];
  ministries: { id: string; name: string }[];
  departments: { id: string; name: string; ministryId: string }[];
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

export default function AbsencesClient({
  churchId,
  canView,
  canManage,
  selfMembers,
  manageableMembers,
  ministries,
  departments,
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

  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlightId") ?? undefined;

  const [declareOpen, setDeclareOpen] = useState(false);
  const [declareMode, setDeclareMode] = useState<"self" | "manage">("self");
  const [formMemberId, setFormMemberId] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formReason, setFormReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
      rows = rows.filter((a) => new Date(a.endDate) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      rows = rows.filter((a) => new Date(a.startDate) <= to);
    }

    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (sortBy === "member") return memberName(a).localeCompare(memberName(b));
      const diff = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
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

  function openDeclareForSelf() {
    setDeclareMode("self");
    setFormMemberId(selfMembers[0]?.id ?? "");
    setFormStartDate("");
    setFormEndDate("");
    setFormReason("");
    setFormError(null);
    setDeclareOpen(true);
  }

  function openDeclareForOther() {
    setDeclareMode("manage");
    setFormMemberId("");
    setFormStartDate("");
    setFormEndDate("");
    setFormReason("");
    setFormError(null);
    setDeclareOpen(true);
  }

  async function submitDeclare() {
    if (!formMemberId || !formStartDate || !formEndDate) {
      setFormError("Membre, date de début et date de fin sont requis.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/absences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchId,
          memberId: formMemberId,
          startDate: new Date(formStartDate).toISOString(),
          endDate: new Date(formEndDate).toISOString(),
          reason: formReason || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erreur lors de la déclaration");
      }
      setDeclareOpen(false);
      await Promise.all([fetchSelf(), fetchAll()]);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erreur lors de la déclaration");
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

  const activeAbsences = selfAbsences.filter((a) => a.status === "ACTIVE");
  const visibleDepartments = ministryFilter
    ? departments.filter((d) => d.ministryId === ministryFilter)
    : departments;

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
                { header: "Période", accessor: (a) => `${formatDate(a.startDate)} → ${formatDate(a.endDate)}` },
                { header: "Motif", accessor: (a) => a.reason ?? "—" },
                {
                  header: "Conflit",
                  accessor: (a) => <ConflictBadge hasConflict={a.hasConflict} />,
                },
              ]}
              actions={(a) => (
                <Button size="sm" variant="danger" onClick={() => cancelAbsence(a.id)}>
                  Annuler
                </Button>
              )}
            />
          )}
        </section>
      )}

      {canView && (
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-gray-900">Vue d&apos;ensemble</h2>
            {canManage && (
              <Button size="sm" onClick={openDeclareForOther}>Déclarer pour un STAR</Button>
            )}
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
                  { value: "STAR", label: "STAR" },
                  { value: "DEPARTMENT_HEAD", label: "Resp. département" },
                  { value: "MINISTER", label: "Ministre" },
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
                { header: "Période", accessor: (a) => `${formatDate(a.startDate)} → ${formatDate(a.endDate)}` },
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
                        <Button size="sm" variant="danger" onClick={() => cancelAbsence(a.id)}>
                          Annuler
                        </Button>
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
        title={declareMode === "self" ? "Déclarer une absence" : "Déclarer pour un STAR"}
      >
        <div className="space-y-4">
          {declareMode === "self" && selfMembers.length > 1 && (
            <Select
              label="Fiche STAR"
              value={formMemberId}
              onChange={(e) => setFormMemberId(e.target.value)}
              options={selfMembers.map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` }))}
            />
          )}
          {declareMode === "manage" && (
            <Select
              label="STAR"
              placeholder="Sélectionner..."
              value={formMemberId}
              onChange={(e) => setFormMemberId(e.target.value)}
              options={manageableMembers.map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` }))}
            />
          )}

          <Input
            type="date"
            label="Date de début"
            value={formStartDate}
            onChange={(e) => setFormStartDate(e.target.value)}
          />
          <Input
            type="date"
            label="Date de fin"
            value={formEndDate}
            onChange={(e) => setFormEndDate(e.target.value)}
          />
          <Input
            label="Motif (optionnel)"
            value={formReason}
            onChange={(e) => setFormReason(e.target.value)}
          />

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeclareOpen(false)}>Annuler</Button>
            <Button onClick={submitDeclare} disabled={submitting}>
              {submitting ? "Envoi..." : "Déclarer"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
