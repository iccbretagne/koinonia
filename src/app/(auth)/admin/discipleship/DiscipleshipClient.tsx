"use client";

import { SubmitEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import {
  Alert,
  Button,
  Checkbox,
  ConfirmModal,
  EmptyState,
  FilterChip,
  IconButton,
  Input,
  Modal,
  Select,
  SkeletonList,
  StatusChip,
  controlClasses,
  useToast,
} from "@/components/ui";
import Tabs, { TabPanel } from "@/components/ui/Tabs";

/** Membre existant (id) ou nouveau disciple saisi par son nom. */
type DiscipleSelection = string | { firstName: string; lastName: string } | null;

// ─── Types ───────────────────────────────────────────────────────────────────

type DeptInfo = Array<{ department: { name: string; ministry: { name: string } } }>;

function getDept(departments: DeptInfo) {
  return departments[0]?.department;
}

interface MemberOption {
  id: string;
  firstName: string;
  lastName: string;
  departments: DeptInfo;
}

interface DiscipleshipRow {
  id: string;
  discipleId: string;
  discipleMakerId: string;
  firstMakerId: string;
  disciple: { id: string; firstName: string; lastName: string; email?: string | null; phone?: string | null; departments: DeptInfo };
  discipleMaker: { id: string; firstName: string; lastName: string };
  firstMaker: { id: string; firstName: string; lastName: string };
  startedAt?: string;
}

interface StatRow {
  discipleshipId: string;
  disciple: { id: string; firstName: string; lastName: string };
  discipleMaker: { id: string; firstName: string; lastName: string };
  firstMaker: { id: string; firstName: string; lastName: string };
  stats: { totalEvents: number; present: number; absent: number; rate: number | null };
}


// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  readonly churchId: string;
  readonly members: MemberOption[];
  readonly allAssignedDiscipleIds: string[];
  readonly canManage: boolean;
  readonly canExport: boolean;
  readonly canEditRelation?: boolean;
  readonly isFD?: boolean;
  readonly linkedMemberId?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function memberLabel(m: MemberOption) {
  const dept = getDept(m.departments);
  return `${m.lastName} ${m.firstName} — ${dept?.ministry?.name ?? "??"}/ ${dept?.name ?? "??"}`;
}

function fullName(m: { firstName: string; lastName: string }) {
  return `${m.firstName} ${m.lastName}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DiscipleshipClient({ churchId, members, allAssignedDiscipleIds, canManage, canExport, canEditRelation = false, isFD = false, linkedMemberId = null }: Props) {
  const [activeTab, setActiveTab] = useState<"relations" | "appel" | "stats">("relations");
  // Filtre global "Mes disciples" — visible uniquement si l'utilisateur est admin/secrétaire ET lié à un membre FD
  const showMineFilter = canManage && !!linkedMemberId;
  const [filterMine, setFilterMine] = useState(showMineFilter);

  const TAB_LABELS: Record<typeof activeTab, string> = {
    relations: "Relations",
    appel: "Appel",
    stats: "Statistiques",
  };

  return (
    <div>
      {/* Onglets internes + filtre "Tous / Mes disciples" */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-2 border-b border-line">
        <Tabs
          ariaLabel="Discipolat"
          idBase="discipleship"
          value={activeTab}
          onChange={setActiveTab}
          className="-mb-px min-w-0 border-b-transparent"
          tabs={(["relations", "appel", "stats"] as const).map((tab) => ({ value: tab, label: TAB_LABELS[tab] }))}
        />

        {showMineFilter && (
          <div className="mb-2 flex gap-2">
            <FilterChip pressed={!filterMine} onClick={() => setFilterMine(false)}>Tous</FilterChip>
            <FilterChip pressed={filterMine} onClick={() => setFilterMine(true)}>Mes disciples</FilterChip>
          </div>
        )}
      </div>

      <TabPanel idBase="discipleship" value={activeTab}>
      {activeTab === "relations" && (
        <RelationsTab churchId={churchId} members={members} allAssignedDiscipleIds={allAssignedDiscipleIds} canManage={canManage} canEditRelation={canEditRelation} isFD={isFD} linkedMemberId={linkedMemberId} filterMine={filterMine} />
      )}
      {activeTab === "appel" && (
        <AppelTab churchId={churchId} canManage={canManage} filterMine={filterMine} linkedMemberId={linkedMemberId} />
      )}
      {activeTab === "stats" && (
        <StatsTab churchId={churchId} canExport={canExport} filterMine={filterMine} linkedMemberId={linkedMemberId} />
      )}
      </TabPanel>
    </div>
  );
}

// ─── Combobox disciple ────────────────────────────────────────────────────────

function rateBarClass(rate: number): string {
  if (rate >= 80) return "bg-success";
  if (rate >= 50) return "bg-warning";
  return "bg-danger";
}

function norm(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function DiscipleCombobox({
  options,
  value,
  onChange,
}: {
  readonly options: MemberOption[];
  readonly value: DiscipleSelection;
  readonly onChange: (v: DiscipleSelection) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const isSelected = value !== null;
  const selectedMember = typeof value === "string" ? options.find((o) => o.id === value) : null;
  const isNew = value !== null && typeof value === "object";

  // Filter by both fields, accent-insensitive
  const qFirst = norm(firstName);
  const qLast = norm(lastName);
  const hasInput = firstName.trim().length > 0 || lastName.trim().length > 0;
  const filtered = hasInput
    ? options.filter((m) => {
        const mFirst = norm(m.firstName);
        const mLast = norm(m.lastName);
        // both fields filled → must match both
        if (qFirst && qLast) return mFirst.includes(qFirst) && mLast.includes(qLast);
        // single field → match either first or last name
        const q = qFirst || qLast;
        return mFirst.includes(q) || mLast.includes(q) ||
          `${mFirst} ${mLast}`.includes(q) || `${mLast} ${mFirst}`.includes(q);
      })
    : options;

  const noMatch = hasInput && filtered.length === 0;

  function selectMember(m: MemberOption) {
    onChange(m.id);
    setFirstName(m.firstName);
    setLastName(m.lastName);
  }

  function confirmNew() {
    onChange({ firstName: firstName.trim(), lastName: lastName.trim() });
  }

  function handleClear() {
    onChange(null);
    setFirstName("");
    setLastName("");
  }

  function handleFieldChange(field: "firstName" | "lastName", val: string) {
    if (field === "firstName") setFirstName(val);
    else setLastName(val);
    if (value !== null) onChange(null); // reset on edit
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      {/* Selected chip */}
      {isSelected && (
        <div className="flex items-center gap-2 rounded-control border border-brand/30 bg-brand-soft py-1 pl-3 pr-1 text-sm">
          <Check aria-hidden="true" className="size-4 shrink-0 text-brand-text" strokeWidth={1.75} />
          <span className="flex-1 font-semibold text-ink">
            {isNew
              ? `${(value as {firstName:string;lastName:string}).firstName} ${(value as {firstName:string;lastName:string}).lastName}`.trim()
              : `${selectedMember?.firstName} ${selectedMember?.lastName}`}
          </span>
          {selectedMember && (
            <span className="text-[13px] leading-[18px] text-ink-muted">{getDept(selectedMember.departments)?.ministry?.name ?? "??"} / {getDept(selectedMember.departments)?.name ?? "??"}</span>
          )}
          {isNew && <StatusChip tone="brand">Nouveau</StatusChip>}
          <IconButton icon={X} size="sm" aria-label="Changer de disciple" onClick={handleClear} />
        </div>
      )}

      {/* Input fields */}
      {!isSelected && (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              aria-label="Prénom du disciple"
              value={firstName}
              onChange={(e) => handleFieldChange("firstName", e.target.value)}
              placeholder="Prénom"
              className={`${controlClasses()} min-w-0 flex-1`}
            />
            <input
              type="text"
              aria-label="Nom du disciple"
              value={lastName}
              onChange={(e) => handleFieldChange("lastName", e.target.value)}
              placeholder="Nom"
              className={`${controlClasses()} min-w-0 flex-1`}
            />
          </div>

          {/* Suggestions */}
          {hasInput && filtered.length > 0 && (
            <ul className="max-h-48 overflow-y-auto overflow-hidden rounded-control border border-line text-sm">
              {filtered.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectMember(m); }}
                    className="min-h-11 w-full border-b border-line px-3 py-2 text-left transition-colors last:border-0 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                  >
                    <span className="font-semibold text-ink">{m.firstName} {m.lastName}</span>
                    <span className="ml-2 text-[13px] text-ink-muted">{getDept(m.departments)?.ministry?.name ?? "??"} / {getDept(m.departments)?.name ?? "??"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Create option */}
          {noMatch && (
            <div className="flex flex-wrap items-center gap-3 rounded-control border border-dashed border-line px-3 py-2 text-sm">
              <span className="flex-1 text-ink-muted">
                Aucun résultat pour «&nbsp;{[firstName, lastName].filter(Boolean).join(" ")}&nbsp;»
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onMouseDown={(e) => { e.preventDefault(); confirmNew(); }}
              >
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
                Créer ce membre
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Tab: Relations ───────────────────────────────────────────────────────────

function RelationsTab({ churchId, members, allAssignedDiscipleIds, canManage, canEditRelation, isFD, linkedMemberId, filterMine }: { readonly churchId: string; readonly members: MemberOption[]; readonly allAssignedDiscipleIds: string[]; readonly canManage: boolean; readonly canEditRelation: boolean; readonly isFD: boolean; readonly linkedMemberId: string | null; readonly filterMine: boolean }) {
  const uid = useId();
  const toast = useToast();
  const [pendingDelete, setPendingDelete] = useState<DiscipleshipRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rows, setRows] = useState<DiscipleshipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal: nouvelle relation
  const [createModal, setCreateModal] = useState(false);
  // discipleSelection: existing member id OR { firstName, lastName } for a new member
  const [discipleSelection, setDiscipleSelection] = useState<DiscipleSelection>(null);
  const [newMakerId, setNewMakerId] = useState(linkedMemberId ?? members[0]?.id ?? "");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  // Modal: éditer profil disciple
  const [editProfileRow, setEditProfileRow] = useState<DiscipleshipRow | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editProfileError, setEditProfileError] = useState<string | null>(null);
  const [editProfileLoading, setEditProfileLoading] = useState(false);

  // Modal: changer FD (pour les FD — scope limité)
  const [changeFDRow, setChangeFDRow] = useState<DiscipleshipRow | null>(null);
  const [newFDId, setNewFDId] = useState("");
  const [changeFDError, setChangeFDError] = useState<string | null>(null);
  const [changeFDLoading, setChangeFDLoading] = useState(false);

  // Modal: modifier la relation (admin/secrétariat — FD + premier FD)
  const [editRelationRow, setEditRelationRow] = useState<DiscipleshipRow | null>(null);
  const [editRelationFDId, setEditRelationFDId] = useState("");
  const [editRelationFirstMakerId, setEditRelationFirstMakerId] = useState("");
  const [editRelationError, setEditRelationError] = useState<string | null>(null);
  const [editRelationLoading, setEditRelationLoading] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/discipleships?churchId=${churchId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setRows(Array.isArray(json) ? json : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [churchId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des données au montage et au changement de dépendance
  useEffect(() => { void fetchRows(); }, [fetchRows]);

  // Membres déjà pris comme disciple (liste complète de l'église + nouvelles relations ajoutées en session)
  const assignedDiscipleIds = new Set([
    ...allAssignedDiscipleIds,
    ...rows.map((r) => r.discipleId),
  ]);
  const availableDisciples = members.filter((m) => !assignedDiscipleIds.has(m.id));

  async function handleCreate(e: SubmitEvent) {
    e.preventDefault();
    if (!discipleSelection) { setCreateError("Sélectionnez ou créez un disciple"); return; }
    const makerId = isFD ? (linkedMemberId ?? newMakerId) : newMakerId;
    setCreateLoading(true);
    setCreateError(null);
    try {
      const body = typeof discipleSelection === "string"
        ? { discipleId: discipleSelection, discipleMakerId: makerId, churchId }
        : { newMember: discipleSelection, discipleMakerId: makerId, churchId };
      const res = await fetch("/api/discipleships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setCreateModal(false);
      void fetchRows();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCreateLoading(false);
    }
  }

  function openEditProfile(row: DiscipleshipRow) {
    setEditProfileRow(row);
    setEditFirstName(row.disciple.firstName);
    setEditLastName(row.disciple.lastName);
    setEditEmail(row.disciple.email ?? "");
    setEditPhone(row.disciple.phone ?? "");
    setEditProfileError(null);
  }

  async function handleEditProfile(e: SubmitEvent) {
    e.preventDefault();
    if (!editProfileRow) return;
    setEditProfileLoading(true);
    setEditProfileError(null);
    try {
      const res = await fetch(`/api/discipleships/${editProfileRow.id}/member`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: editFirstName.trim(),
          lastName: editLastName.trim(),
          email: editEmail.trim() || null,
          phone: editPhone.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      // Mettre à jour la ligne localement
      setRows((prev) => prev.map((r) =>
        r.id === editProfileRow.id
          ? { ...r, disciple: { ...r.disciple, firstName: json.firstName, lastName: json.lastName } }
          : r
      ));
      setEditProfileRow(null);
    } catch (e) {
      setEditProfileError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setEditProfileLoading(false);
    }
  }

  async function handleDelete(row: DiscipleshipRow) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/discipleships/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error ?? "Erreur lors de la suppression");
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setPendingDelete(null);
      toast.success(isFD ? "Disciple détaché" : "Relation supprimée");
    } catch {
      toast.error("Erreur lors de la suppression");
    } finally {
      setDeleting(false);
    }
  }

  function openChangeFD(row: DiscipleshipRow) {
    setChangeFDRow(row);
    setNewFDId(members[0]?.id ?? "");
    setChangeFDError(null);
  }

  async function handleChangeFD(e: SubmitEvent) {
    e.preventDefault();
    if (!changeFDRow) return;
    if (newFDId === changeFDRow.discipleId) {
      setChangeFDError("Un STAR ne peut pas être son propre FD");
      return;
    }
    setChangeFDLoading(true);
    setChangeFDError(null);
    try {
      const res = await fetch(`/api/discipleships/${changeFDRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discipleMakerId: newFDId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setChangeFDRow(null);
      void fetchRows();
    } catch (e) {
      setChangeFDError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setChangeFDLoading(false);
    }
  }

  function openEditRelation(row: DiscipleshipRow) {
    setEditRelationRow(row);
    setEditRelationFDId(row.discipleMakerId);
    setEditRelationFirstMakerId(row.firstMakerId);
    setEditRelationError(null);
  }

  async function handleEditRelation(e: SubmitEvent) {
    e.preventDefault();
    if (!editRelationRow) return;
    setEditRelationLoading(true);
    setEditRelationError(null);
    try {
      const body: Record<string, string> = { discipleMakerId: editRelationFDId };
      if (editRelationFirstMakerId !== editRelationRow.firstMakerId) {
        body.firstMakerId = editRelationFirstMakerId;
      }
      const res = await fetch(`/api/discipleships/${editRelationRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setEditRelationRow(null);
      void fetchRows();
    } catch (e) {
      setEditRelationError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setEditRelationLoading(false);
    }
  }

  const displayedRows = filterMine && linkedMemberId
    ? rows.filter((r) => r.discipleMakerId === linkedMemberId)
    : rows;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {canManage && (
          <Button onClick={() => { setCreateModal(true); setCreateError(null); setDiscipleSelection(null); setNewMakerId(linkedMemberId ?? members[0]?.id ?? ""); }}>
            Créer une relation
          </Button>
        )}
      </div>

      {loading && <SkeletonList rows={4} />}
      {error && <Alert tone="danger">{error}</Alert>}

      {!loading && !error && (
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {displayedRows.length === 0 ? (
            <EmptyState size="sm" title="Aucune relation de discipolat" />
          ) : (
            <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-line bg-surface-sunken">
                    <th className="text-left px-4 py-3 font-semibold text-ink-muted">Disciple</th>
                    <th className="text-left px-4 py-3 font-semibold text-ink-muted">FD actuel</th>
                    <th className="text-left px-4 py-3 font-semibold text-ink-muted">Premier FD</th>
                    <th className="text-left px-4 py-3 font-semibold text-ink-muted">Depuis</th>
                    {canManage && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map((row) => (
                    <tr key={row.id} className="border-b border-line hover:bg-surface-sunken transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{fullName(row.disciple)}</div>
                        <div className="text-[13px] leading-[18px] text-ink-muted">
                          {getDept(row.disciple.departments)?.ministry?.name ?? "??"} / {getDept(row.disciple.departments)?.name ?? "??"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{fullName(row.discipleMaker)}</td>
                      <td className="px-4 py-3 text-ink-muted">{fullName(row.firstMaker)}</td>
                      <td className="px-4 py-3 text-[13px] text-ink-muted">
                        {row.startedAt ? new Date(row.startedAt).toLocaleDateString("fr-FR") : "—"}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex gap-2 justify-end">
                            <Button variant="secondary" size="sm" onClick={() => openEditProfile(row)}>
                              Modifier le profil
                            </Button>
                            {canEditRelation && (
                              <Button variant="secondary" size="sm" onClick={() => openEditRelation(row)}>
                                Modifier la relation
                              </Button>
                            )}
                            {isFD && (
                              <Button variant="secondary" size="sm" onClick={() => openChangeFD(row)}>
                                Changer de FD
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => setPendingDelete(row)}>
                              {isFD ? "Détacher" : "Supprimer"}
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-line">
              {displayedRows.map((row) => (
                <div key={row.id} className="p-4 space-y-2">
                  <div>
                    <div className="font-medium text-ink">{fullName(row.disciple)}</div>
                    <div className="text-[13px] leading-[18px] text-ink-muted">{getDept(row.disciple.departments)?.ministry?.name ?? "??"} / {getDept(row.disciple.departments)?.name ?? "??"}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <div>
                      <span className="text-[13px] leading-[18px] text-ink-muted">FD actuel</span>
                      <div className="text-ink-muted">{fullName(row.discipleMaker)}</div>
                    </div>
                    <div>
                      <span className="text-[13px] leading-[18px] text-ink-muted">Premier FD</span>
                      <div className="text-ink-muted">{fullName(row.firstMaker)}</div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[13px] leading-[18px] text-ink-muted">Depuis</span>
                      <div className="text-[13px] text-ink-muted">{row.startedAt ? new Date(row.startedAt).toLocaleDateString("fr-FR") : "—"}</div>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button variant="secondary" size="sm" onClick={() => openEditProfile(row)}>
                        Modifier le profil
                      </Button>
                      {canEditRelation && (
                        <Button variant="secondary" size="sm" onClick={() => openEditRelation(row)}>
                          Modifier la relation
                        </Button>
                      )}
                      {isFD && (
                        <Button variant="secondary" size="sm" onClick={() => openChangeFD(row)}>
                          Changer de FD
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setPendingDelete(row)}>
                        {isFD ? "Détacher" : "Supprimer"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            </>
          )}
        </div>
      )}

      {/* Modal: nouvelle relation */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Créer une relation de discipolat">
        <form onSubmit={handleCreate} className="space-y-4">
          <fieldset className="min-w-0">
            <legend className="mb-1 block text-sm font-semibold text-ink">Disciple</legend>
            <DiscipleCombobox
              options={availableDisciples}
              value={discipleSelection}
              onChange={setDiscipleSelection}
            />
            {discipleSelection && typeof discipleSelection === "object" && (
              <p className="mt-1 text-[13px] leading-[18px] text-ink-muted">
                Nouveau membre — sera ajouté dans «&nbsp;Sans département&nbsp;».
              </p>
            )}
          </fieldset>

          {!isFD && (
            <Select
              label="Faiseur de disciples (FD)"
              value={newMakerId}
              onChange={(e) => setNewMakerId(e.target.value)}
              options={members.map((m) => ({ value: m.id, label: memberLabel(m) }))}
            />
          )}
          {createError && <Alert tone="danger">{createError}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setCreateModal(false)}>
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={createLoading || !discipleSelection}
              title={!discipleSelection ? "Choisissez ou saisissez d'abord un disciple" : undefined}
            >
              {createLoading ? "Création…" : "Créer la relation"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: éditer profil disciple */}
      <Modal open={!!editProfileRow} onClose={() => setEditProfileRow(null)} title="Modifier le profil du disciple">
        {editProfileRow && (
          <form onSubmit={handleEditProfile} className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                id={`${uid}-first-name`}
                label="Prénom"
                type="text"
                value={editFirstName}
                onChange={(e) => setEditFirstName(e.target.value)}
                required
                className="flex-1"
              />
              <Input
                id={`${uid}-last-name`}
                label="Nom"
                type="text"
                value={editLastName}
                onChange={(e) => setEditLastName(e.target.value)}
                required
                className="flex-1"
              />
            </div>
            <Input
              id={`${uid}-email`}
              label="Email (facultatif)"
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              placeholder="prenom.nom@email.com"
            />
            <Input
              id={`${uid}-phone`}
              label="Téléphone (facultatif)"
              type="tel"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              placeholder="+33 6 00 00 00 00"
            />
            {editProfileError && <Alert tone="danger">{editProfileError}</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => setEditProfileRow(null)}>
                Annuler
              </Button>
              <Button type="submit" disabled={editProfileLoading}>
                {editProfileLoading ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: changer FD */}
      <Modal open={!!changeFDRow} onClose={() => setChangeFDRow(null)} title="Changer le faiseur de disciples">
        {changeFDRow && (
          <form onSubmit={handleChangeFD} className="space-y-4">
            <p className="text-sm text-ink-muted">
              Disciple : <strong className="text-ink">{fullName(changeFDRow.disciple)}</strong>
            </p>
            <p className="text-sm text-ink-muted">
              FD actuel : {fullName(changeFDRow.discipleMaker)}
            </p>
            <Select
              label="Nouveau FD"
              value={newFDId}
              onChange={(e) => setNewFDId(e.target.value)}
              options={members.map((m) => ({ value: m.id, label: memberLabel(m) }))}
            />
            {changeFDError && <Alert tone="danger">{changeFDError}</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => setChangeFDRow(null)}>
                Annuler
              </Button>
              <Button type="submit" disabled={changeFDLoading}>
                {changeFDLoading ? "Enregistrement…" : "Changer de FD"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: modifier la relation (admin/secrétariat) */}
      <Modal open={!!editRelationRow} onClose={() => setEditRelationRow(null)} title="Modifier la relation de discipolat">
        {editRelationRow && (
          <form onSubmit={handleEditRelation} className="space-y-4">
            <div className="rounded-control border border-line px-3 py-2 text-sm">
              <span className="text-ink-muted">Disciple : </span>
              <strong className="text-ink">{fullName(editRelationRow.disciple)}</strong>
              <span className="ml-2 text-[13px] text-ink-muted">
                {getDept(editRelationRow.disciple.departments)?.ministry?.name ?? "??"} / {getDept(editRelationRow.disciple.departments)?.name ?? "??"}
              </span>
            </div>
            <Select
              label="Faiseur de disciples actuel"
              value={editRelationFDId}
              onChange={(e) => setEditRelationFDId(e.target.value)}
              options={members.map((m) => ({ value: m.id, label: memberLabel(m) }))}
            />
            <Select
              label="Premier faiseur de disciples (lignée d'origine)"
              value={editRelationFirstMakerId}
              onChange={(e) => setEditRelationFirstMakerId(e.target.value)}
              options={members.map((m) => ({ value: m.id, label: memberLabel(m) }))}
            />
            {editRelationError && <Alert tone="danger">{editRelationError}</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => setEditRelationRow(null)}>
                Annuler
              </Button>
              <Button type="submit" disabled={editRelationLoading}>
                {editRelationLoading ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmModal
        open={pendingDelete !== null}
        title={
          isFD
            ? `Détacher ${pendingDelete ? fullName(pendingDelete.disciple) : ""} ?`
            : `Supprimer la relation de discipolat de ${pendingDelete ? fullName(pendingDelete.disciple) : ""} ?`
        }
        message={isFD ? "Ce disciple ne sera plus rattaché à vous." : "La relation est supprimée ; la fiche du disciple est conservée."}
        confirmLabel={isFD ? "Détacher le disciple" : "Supprimer la relation"}
        confirmingLabel={isFD ? "Détachement…" : "Suppression…"}
        confirming={deleting}
        onConfirm={() => { if (pendingDelete) void handleDelete(pendingDelete); }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

// ─── Tab: Appel ───────────────────────────────────────────────────────────────

interface TrackedEvent {
  id: string;
  title: string;
  date: string;
}

function AppelTab({ churchId, canManage, filterMine, linkedMemberId }: { readonly churchId: string; readonly canManage: boolean; readonly filterMine: boolean; readonly linkedMemberId: string | null }) {
  const uid = useId();
  const [events, setEvents] = useState<TrackedEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [discipleships, setDiscipleships] = useState<DiscipleshipRow[]>([]);
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch tracked events
  useEffect(() => {
    async function fetchEvents() {
      setLoadingEvents(true);
      try {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const from = oneMonthAgo.toISOString().slice(0, 10);
        const res = await fetch(`/api/events?churchId=${churchId}&trackedForDiscipleship=true&from=${from}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Erreur");
        const list: TrackedEvent[] = (Array.isArray(json) ? json : []).map(
          (e: TrackedEvent) => ({ id: e.id, title: e.title, date: e.date })
        );
        setEvents(list);
        if (list.length > 0) {
          const now = Date.now();
          // Pick the closest event to today (prefer upcoming, fallback to most recent past)
          const closest = list.reduce((best, ev) => {
            const distBest = Math.abs(new Date(best.date).getTime() - now);
            const distEv = Math.abs(new Date(ev.date).getTime() - now);
            return distEv < distBest ? ev : best;
          }, list[0]);
          setSelectedEventId(closest.id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      } finally {
        setLoadingEvents(false);
      }
    }
    void fetchEvents();
  }, [churchId]);

  // Fetch disciples + existing attendance when event changes
  useEffect(() => {
    if (!selectedEventId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des données au montage et au changement de dépendance
    setLoadingAttendance(true);
    setError(null);
    setSaved(false);

    Promise.all([
      fetch(`/api/discipleships?churchId=${churchId}`).then((r) => r.json()),
      fetch(`/api/discipleships/attendance?eventId=${selectedEventId}`).then((r) => r.json()),
    ])
      .then(([discipleshipsJson, attendanceJson]) => {
        const rows: DiscipleshipRow[] = Array.isArray(discipleshipsJson) ? discipleshipsJson : [];
        setDiscipleships(rows);
        const att: { memberId: string; present: boolean }[] = Array.isArray(attendanceJson) ? attendanceJson : [];
        const presentSet = new Set(att.filter((a) => a.present).map((a) => a.memberId));
        // If no attendance recorded yet, default all present
        setPresentIds(att.length === 0 ? new Set(rows.map((d) => d.discipleId)) : presentSet);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"))
      .finally(() => setLoadingAttendance(false));
  }, [selectedEventId, churchId]);

  function togglePresence(memberId: string) {
    setPresentIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
    setSaved(false);
  }

  async function handleSave() {
    if (!selectedEventId) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/discipleships/attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: selectedEventId, presentMemberIds: Array.from(presentIds) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  // Group disciples by discipleMaker (filtre visuel uniquement — le save opère toujours sur tout)
  const visibleDiscipleships = filterMine && linkedMemberId
    ? discipleships.filter((d) => d.discipleMakerId === linkedMemberId)
    : discipleships;

  const grouped = visibleDiscipleships.reduce((acc, d) => {
    const key = d.discipleMakerId;
    if (!acc[key]) acc[key] = { maker: d.discipleMaker, disciples: [] };
    acc[key].disciples.push(d);
    return acc;
  }, {} as Record<string, { maker: { id: string; firstName: string; lastName: string }; disciples: DiscipleshipRow[] }>);

  if (loadingEvents) return <SkeletonList rows={4} />;
  if (events.length === 0) return (
    <EmptyState
      title="Aucun événement suivi pour le discipolat"
      description="Activez le suivi discipolat sur un événement depuis Administration → Événements → Configurer."
    />
  );

  return (
    <div>
      {/* Event selector */}
      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-card border border-line bg-surface p-4">
        <div className="min-w-48 flex-1">
          <Select
            id={`${uid}-event`}
            label="Événement"
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            options={events.map((ev) => ({
              value: ev.id,
              label: `${ev.title} — ${new Date(ev.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}`,
            }))}
          />
        </div>
        {canManage && (
          <Button onClick={handleSave} disabled={saving || loadingAttendance}>
            {saving ? "Enregistrement…" : "Enregistrer l'appel"}
          </Button>
        )}
        {saved && (
          <span role="status" className="flex items-center gap-1.5 text-sm font-semibold text-success">
            <Check aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Appel enregistré
          </span>
        )}
      </div>

      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}

      {loadingAttendance && <SkeletonList rows={4} />}
      {!loadingAttendance && discipleships.length === 0 && (
        <EmptyState size="sm" title="Aucun disciple enregistré" />
      )}
      {!loadingAttendance && discipleships.length > 0 && (
        <div className="space-y-4">
          {Object.values(grouped).map(({ maker, disciples }) => (
            <div key={maker.id} className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
              <div className="border-b border-line bg-surface-sunken px-4 py-3">
                <span className="text-sm font-semibold text-ink">
                  FD : {fullName(maker)}
                </span>
                <span className="ml-3 text-[13px] text-ink-muted">
                  {disciples.filter((d) => presentIds.has(d.discipleId)).length} / {disciples.length} présent{disciples.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="divide-y divide-line">
                {disciples.map((d) => {
                  const present = presentIds.has(d.discipleId);
                  return (
                    <label
                      key={d.id}
                      className={`flex min-h-11 cursor-pointer flex-wrap items-center gap-3 px-4 py-3 transition-colors ${
                        present ? "bg-success-soft" : "hover:bg-surface-sunken"
                      } ${!canManage ? "pointer-events-none" : ""}`}
                    >
                      <Checkbox
                        checked={present}
                        onChange={() => canManage && togglePresence(d.discipleId)}
                        disabled={!canManage}
                      />
                      <span className="text-[15px] font-semibold text-ink">{fullName(d.disciple)}</span>
                      <span className="text-[13px] text-ink-muted">
                        {getDept(d.disciple.departments)?.ministry?.name ?? "??"} / {getDept(d.disciple.departments)?.name ?? "??"}
                      </span>
                      <StatusChip tone={present ? "success" : "neutral"} className="ml-auto">
                        {present ? "Présent" : "Absent"}
                      </StatusChip>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Statistiques ────────────────────────────────────────────────────────

function StatsTab({ churchId, canExport, filterMine, linkedMemberId }: { readonly churchId: string; readonly canExport: boolean; readonly filterMine: boolean; readonly linkedMemberId: string | null }) {
  const uid = useId();
  const toast = useToast();
  const [from, setFrom] = useState(firstDayOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<{ period: { from: string; to: string }; trackedEvents: { id: string; title: string; date: string }[]; stats: StatRow[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/discipleships/stats?churchId=${churchId}&from=${from}&to=${to}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [churchId, from, to]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des données au montage et au changement de dépendance
  useEffect(() => { void fetchStats(); }, [fetchStats]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/discipleships/export?churchId=${churchId}&from=${from}&to=${to}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error((json as { error?: string }).error ?? "Erreur lors de l'export");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `discipolat-${from}-${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Erreur lors de l'export");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      {/* Period selector */}
      <div className="mb-6 flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
        <div className="flex flex-1 gap-3">
          <Input id={`${uid}-from`} label="Du" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="flex-1" />
          <Input id={`${uid}-to`} label="Au" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="flex-1" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={fetchStats} disabled={loading}>
            {loading ? "Chargement…" : "Actualiser"}
          </Button>
          {canExport && (
            <Button variant="secondary" onClick={handleExport} disabled={exporting}>
              {exporting ? "Export…" : "Exporter en Excel"}
            </Button>
          )}
        </div>
      </div>

      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}

      {data && (
        <>
          {data.trackedEvents.length === 0 ? (
            <EmptyState size="sm" title="Aucun événement suivi sur cette période" />
          ) : (
            (() => {
              const displayedStats = filterMine && linkedMemberId
                ? data.stats.filter((r) => r.discipleMaker.id === linkedMemberId)
                : data.stats;
              return (
            <>
              <p className="mb-3 text-[13px] leading-[18px] text-ink-muted">
                {data.trackedEvents.length} événement{data.trackedEvents.length > 1 ? "s" : ""} suivi{data.trackedEvents.length > 1 ? "s" : ""} sur la période
                {filterMine && <span className="ml-2 font-semibold text-ink">— Mes disciples uniquement</span>}
              </p>
              <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
                {displayedStats.length === 0 ? (
                  <EmptyState size="sm" title="Aucun disciple enregistré" />
                ) : (
                  <>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-line bg-surface-sunken">
                          <th className="text-left px-4 py-3 font-semibold text-ink-muted">Disciple</th>
                          <th className="text-left px-4 py-3 font-semibold text-ink-muted">FD</th>
                          <th className="text-left px-4 py-3 font-semibold text-ink-muted">Présences / Total</th>
                          <th className="text-left px-4 py-3 font-semibold text-ink-muted">Taux</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedStats.map((row) => (
                          <tr key={row.discipleshipId} className="border-b border-line hover:bg-surface-sunken transition-colors">
                            <td className="px-4 py-3 font-medium text-ink">{fullName(row.disciple)}</td>
                            <td className="px-4 py-3 text-ink-muted">{fullName(row.discipleMaker)}</td>
                            <td className="px-4 py-3 text-ink-muted">
                              {row.stats.present} / {row.stats.totalEvents}
                            </td>
                            <td className="px-4 py-3">
                              {row.stats.rate === null ? (
                                <span className="text-ink-muted">—</span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div className="h-2 w-24 overflow-hidden rounded-full bg-line">
                                    <div
                                      className={`h-full rounded-full transition-all ${rateBarClass(row.stats.rate)}`}
                                      style={{ width: `${row.stats.rate}%` }}
                                    />
                                  </div>
                                  <span className="text-[13px] font-semibold text-ink-muted">{row.stats.rate}%</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-line">
                    {displayedStats.map((row) => (
                      <div key={row.discipleshipId} className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-ink">{fullName(row.disciple)}</div>
                            <div className="text-[13px] leading-[18px] text-ink-muted">FD : {fullName(row.discipleMaker)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-ink">{row.stats.present}/{row.stats.totalEvents}</div>
                            <div className="text-[13px] text-ink-muted">{row.stats.present > 1 ? "présences" : "présence"}</div>
                          </div>
                        </div>
                        {row.stats.rate !== null && (
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                              <div
                                className={`h-full rounded-full transition-all ${rateBarClass(row.stats.rate)}`}
                                style={{ width: `${row.stats.rate}%` }}
                              />
                            </div>
                            <span className="text-[13px] font-semibold text-ink-muted w-10 text-right">{row.stats.rate}%</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  </>
                )}
              </div>
            </>
              );
            })()
          )}
        </>
      )}
    </div>
  );
}

