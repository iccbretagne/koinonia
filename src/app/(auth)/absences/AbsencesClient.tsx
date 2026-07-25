"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import DataTable from "@/components/ui/DataTable";

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
                  accessor: (a) =>
                    a.hasConflict ? (
                      <span className="text-orange-700 font-medium">⚠ Conflit planning</span>
                    ) : (
                      "—"
                    ),
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

          <div className="flex flex-wrap gap-3">
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
          </div>

          {loadingAll ? (
            <p className="text-gray-500 text-sm">Chargement...</p>
          ) : (
            <DataTable
              data={allAbsences.filter((a) => a.status === "ACTIVE")}
              emptyMessage="Aucune absence."
              columns={[
                { header: "Membre", accessor: (a) => `${a.member.firstName} ${a.member.lastName}` },
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
                {
                  header: "Conflit",
                  accessor: (a) => (a.hasConflict ? <span className="text-orange-700 font-medium">⚠</span> : "—"),
                },
              ]}
              actions={
                canManage
                  ? (a) => (
                      <Button size="sm" variant="danger" onClick={() => cancelAbsence(a.id)}>
                        Annuler
                      </Button>
                    )
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
