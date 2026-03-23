"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";

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
  churchId: string;
  members: MemberOption[];
  allAssignedDiscipleIds: string[];
  canManage: boolean;
  canExport: boolean;
  canEditRelation?: boolean;
  isFD?: boolean;
  linkedMemberId?: string | null;
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

  const TAB_LABELS: Record<typeof activeTab, string> = {
    relations: "Relations",
    appel: "Appel",
    stats: "Statistiques",
  };

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b-2 border-gray-200">
        {(["relations", "appel", "stats"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 sm:py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab
                ? "bg-icc-violet text-white"
                : "text-gray-600 hover:text-icc-violet hover:bg-icc-violet/5"
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {activeTab === "relations" && (
        <RelationsTab churchId={churchId} members={members} allAssignedDiscipleIds={allAssignedDiscipleIds} canManage={canManage} canEditRelation={canEditRelation} isFD={isFD} linkedMemberId={linkedMemberId} />
      )}
      {activeTab === "appel" && (
        <AppelTab churchId={churchId} canManage={canManage} />
      )}
      {activeTab === "stats" && (
        <StatsTab churchId={churchId} canExport={canExport} />
      )}
    </div>
  );
}

// ─── Combobox disciple ────────────────────────────────────────────────────────

function DiscipleCombobox({
  options,
  value,
  onChange,
}: {
  options: MemberOption[];
  value: string | { firstName: string; lastName: string } | null;
  onChange: (v: string | { firstName: string; lastName: string } | null) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const isSelected = value !== null;
  const selectedMember = typeof value === "string" ? options.find((o) => o.id === value) : null;
  const isNew = value !== null && typeof value === "object";

  function norm(s: string) {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

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
    <div ref={containerRef} className="space-y-2">
      {/* Selected chip */}
      {isSelected && (
        <div className="flex items-center gap-2 px-3 py-2 bg-icc-violet/10 border-2 border-icc-violet/30 rounded-lg text-sm">
          <svg className="w-4 h-4 text-icc-violet shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="flex-1 font-medium text-gray-900">
            {isNew
              ? `${(value as {firstName:string;lastName:string}).firstName} ${(value as {firstName:string;lastName:string}).lastName}`.trim()
              : `${selectedMember?.firstName} ${selectedMember?.lastName}`}
          </span>
          {selectedMember && (
            <span className="text-xs text-gray-400">{getDept(selectedMember.departments)?.ministry?.name ?? "??"} / {getDept(selectedMember.departments)?.name ?? "??"}</span>
          )}
          {isNew && <span className="text-xs text-icc-violet">nouveau</span>}
          <button type="button" onClick={handleClear} className="text-gray-400 hover:text-gray-600 ml-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Input fields */}
      {!isSelected && (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              value={firstName}
              onChange={(e) => handleFieldChange("firstName", e.target.value)}
              placeholder="Prénom"
              className="flex-1 border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
            />
            <input
              type="text"
              value={lastName}
              onChange={(e) => handleFieldChange("lastName", e.target.value)}
              placeholder="Nom"
              className="flex-1 border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
            />
          </div>

          {/* Suggestions */}
          {hasInput && filtered.length > 0 && (
            <ul className="border-2 border-gray-200 rounded-lg overflow-hidden text-sm max-h-48 overflow-y-auto">
              {filtered.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectMember(m); }}
                    className="w-full text-left px-3 py-2 hover:bg-icc-violet/5 transition-colors border-b border-gray-100 last:border-0"
                  >
                    <span className="font-medium text-gray-900">{m.firstName} {m.lastName}</span>
                    <span className="ml-2 text-xs text-gray-400">{getDept(m.departments)?.ministry?.name ?? "??"} / {getDept(m.departments)?.name ?? "??"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Create option */}
          {noMatch && (
            <div className="flex items-center gap-3 px-3 py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm">
              <span className="flex-1 text-gray-500">
                Aucun résultat pour «&nbsp;{[firstName, lastName].filter(Boolean).join(" ")}&nbsp;»
              </span>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); confirmNew(); }}
                className="text-icc-violet font-medium hover:underline whitespace-nowrap"
              >
                + Créer ce membre
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Tab: Relations ───────────────────────────────────────────────────────────

function RelationsTab({ churchId, members, allAssignedDiscipleIds, canManage, canEditRelation, isFD, linkedMemberId }: { churchId: string; members: MemberOption[]; allAssignedDiscipleIds: string[]; canManage: boolean; canEditRelation: boolean; isFD: boolean; linkedMemberId: string | null }) {
  const [rows, setRows] = useState<DiscipleshipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal: nouvelle relation
  const [createModal, setCreateModal] = useState(false);
  // discipleSelection: existing member id OR { firstName, lastName } for a new member
  const [discipleSelection, setDiscipleSelection] = useState<string | { firstName: string; lastName: string } | null>(null);
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

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // Membres déjà pris comme disciple (liste complète de l'église + nouvelles relations ajoutées en session)
  const assignedDiscipleIds = new Set([
    ...allAssignedDiscipleIds,
    ...rows.map((r) => r.discipleId),
  ]);
  const availableDisciples = members.filter((m) => !assignedDiscipleIds.has(m.id));

  async function handleCreate(e: React.FormEvent) {
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
      fetchRows();
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

  async function handleEditProfile(e: React.FormEvent) {
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
    if (!confirm(`Supprimer la relation de discipolat de ${fullName(row.disciple)} ?`)) return;
    try {
      const res = await fetch(`/api/discipleships/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error ?? "Erreur");
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch {
      alert("Erreur lors de la suppression");
    }
  }

  function openChangeFD(row: DiscipleshipRow) {
    setChangeFDRow(row);
    setNewFDId(members[0]?.id ?? "");
    setChangeFDError(null);
  }

  async function handleChangeFD(e: React.FormEvent) {
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
      fetchRows();
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

  async function handleEditRelation(e: React.FormEvent) {
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
      fetchRows();
    } catch (e) {
      setEditRelationError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setEditRelationLoading(false);
    }
  }

  return (
    <>
      {canManage && (
        <div className="mb-4">
          <Button onClick={() => { setCreateModal(true); setCreateError(null); setDiscipleSelection(null); setNewMakerId(linkedMemberId ?? members[0]?.id ?? ""); }}>
            Nouvelle relation
          </Button>
        </div>
      )}

      {loading && <p className="text-sm text-gray-400">Chargement...</p>}
      {error && <p className="text-sm text-icc-rouge">{error}</p>}

      {!loading && !error && (
        <div className="bg-white rounded-lg shadow border-2 border-gray-100 overflow-hidden">
          {rows.length === 0 ? (
            <p className="text-sm text-gray-400 p-6">Aucune relation de discipolat.</p>
          ) : (
            <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Disciple</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">FD actuel</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Premier FD</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Depuis</th>
                    {canManage && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{fullName(row.disciple)}</div>
                        <div className="text-xs text-gray-400">
                          {getDept(row.disciple.departments)?.ministry?.name ?? "??"} / {getDept(row.disciple.departments)?.name ?? "??"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{fullName(row.discipleMaker)}</td>
                      <td className="px-4 py-3 text-gray-500">{fullName(row.firstMaker)}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {row.startedAt ? new Date(row.startedAt).toLocaleDateString("fr-FR") : "—"}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex gap-2 justify-end">
                            <Button variant="secondary" size="sm" onClick={() => openEditProfile(row)}>
                              Éditer
                            </Button>
                            {canEditRelation && (
                              <Button variant="secondary" size="sm" onClick={() => openEditRelation(row)}>
                                Modifier relation
                              </Button>
                            )}
                            {isFD && (
                              <Button variant="secondary" size="sm" onClick={() => openChangeFD(row)}>
                                Changer FD
                              </Button>
                            )}
                            <Button variant="danger" size="sm" onClick={() => handleDelete(row)}>
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
            <div className="md:hidden divide-y divide-gray-100">
              {rows.map((row) => (
                <div key={row.id} className="p-4 space-y-2">
                  <div>
                    <div className="font-medium text-gray-900">{fullName(row.disciple)}</div>
                    <div className="text-xs text-gray-400">{getDept(row.disciple.departments)?.ministry?.name ?? "??"} / {getDept(row.disciple.departments)?.name ?? "??"}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <div>
                      <span className="text-xs text-gray-400">FD actuel</span>
                      <div className="text-gray-700">{fullName(row.discipleMaker)}</div>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">Premier FD</span>
                      <div className="text-gray-500">{fullName(row.firstMaker)}</div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-xs text-gray-400">Depuis</span>
                      <div className="text-gray-500 text-xs">{row.startedAt ? new Date(row.startedAt).toLocaleDateString("fr-FR") : "—"}</div>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button variant="secondary" size="sm" onClick={() => openEditProfile(row)}>
                        Éditer
                      </Button>
                      {canEditRelation && (
                        <Button variant="secondary" size="sm" onClick={() => openEditRelation(row)}>
                          Modifier relation
                        </Button>
                      )}
                      {isFD && (
                        <Button variant="secondary" size="sm" onClick={() => openChangeFD(row)}>
                          Changer FD
                        </Button>
                      )}
                      <Button variant="danger" size="sm" onClick={() => handleDelete(row)}>
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
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Nouvelle relation de discipolat">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Disciple</label>
            <DiscipleCombobox
              options={availableDisciples}
              value={discipleSelection}
              onChange={setDiscipleSelection}
            />
            {discipleSelection && typeof discipleSelection === "object" && (
              <p className="mt-1 text-xs text-gray-400">
                Nouveau membre — sera ajouté dans «&nbsp;Sans département&nbsp;».
              </p>
            )}
          </div>

          {!isFD && (
            <Select
              label="Faiseur de disciples (FD)"
              value={newMakerId}
              onChange={(e) => setNewMakerId(e.target.value)}
              options={members.map((m) => ({ value: m.id, label: memberLabel(m) }))}
            />
          )}
          {createError && <p className="text-sm text-icc-rouge">{createError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setCreateModal(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={createLoading || !discipleSelection}>
              {createLoading ? "Enregistrement..." : "Créer"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: éditer profil disciple */}
      <Modal open={!!editProfileRow} onClose={() => setEditProfileRow(null)} title="Modifier le profil du disciple">
        {editProfileRow && (
          <form onSubmit={handleEditProfile} className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
                <input
                  type="text"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  required
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                <input
                  type="text"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  required
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-gray-400 font-normal">(optionnel)</span></label>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="prenom.nom@email.com"
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone <span className="text-gray-400 font-normal">(optionnel)</span></label>
              <input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+33 6 00 00 00 00"
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
              />
            </div>
            {editProfileError && <p className="text-sm text-icc-rouge">{editProfileError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => setEditProfileRow(null)}>
                Annuler
              </Button>
              <Button type="submit" disabled={editProfileLoading}>
                {editProfileLoading ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: changer FD */}
      <Modal open={!!changeFDRow} onClose={() => setChangeFDRow(null)} title="Changer le faiseur de disciples">
        {changeFDRow && (
          <form onSubmit={handleChangeFD} className="space-y-4">
            <p className="text-sm text-gray-600">
              Disciple : <strong>{fullName(changeFDRow.disciple)}</strong>
            </p>
            <p className="text-sm text-gray-500">
              FD actuel : {fullName(changeFDRow.discipleMaker)}
            </p>
            <Select
              label="Nouveau FD"
              value={newFDId}
              onChange={(e) => setNewFDId(e.target.value)}
              options={members.map((m) => ({ value: m.id, label: memberLabel(m) }))}
            />
            {changeFDError && <p className="text-sm text-icc-rouge">{changeFDError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => setChangeFDRow(null)}>
                Annuler
              </Button>
              <Button type="submit" disabled={changeFDLoading}>
                {changeFDLoading ? "Enregistrement..." : "Confirmer"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: modifier la relation (admin/secrétariat) */}
      <Modal open={!!editRelationRow} onClose={() => setEditRelationRow(null)} title="Modifier la relation de discipolat">
        {editRelationRow && (
          <form onSubmit={handleEditRelation} className="space-y-4">
            <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm">
              <span className="text-gray-500">Disciple : </span>
              <strong className="text-gray-900">{fullName(editRelationRow.disciple)}</strong>
              <span className="ml-2 text-xs text-gray-400">
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
            {editRelationError && <p className="text-sm text-icc-rouge">{editRelationError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => setEditRelationRow(null)}>
                Annuler
              </Button>
              <Button type="submit" disabled={editRelationLoading}>
                {editRelationLoading ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

// ─── Tab: Appel ───────────────────────────────────────────────────────────────

interface TrackedEvent {
  id: string;
  title: string;
  date: string;
}

function AppelTab({ churchId, canManage }: { churchId: string; canManage: boolean }) {
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
          });
          setSelectedEventId(closest.id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      } finally {
        setLoadingEvents(false);
      }
    }
    fetchEvents();
  }, [churchId]);

  // Fetch disciples + existing attendance when event changes
  useEffect(() => {
    if (!selectedEventId) return;
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

  // Group disciples by discipleMaker
  const grouped = discipleships.reduce((acc, d) => {
    const key = d.discipleMakerId;
    if (!acc[key]) acc[key] = { maker: d.discipleMaker, disciples: [] };
    acc[key].disciples.push(d);
    return acc;
  }, {} as Record<string, { maker: { id: string; firstName: string; lastName: string }; disciples: DiscipleshipRow[] }>);

  if (loadingEvents) return <p className="text-sm text-gray-400">Chargement des événements...</p>;
  if (events.length === 0) return (
    <p className="text-sm text-gray-500">
      Aucun événement suivi pour le discipolat.{" "}
      <span className="text-gray-400">Activez le suivi discipolat sur un événement depuis Administration → Événements → Configurer.</span>
    </p>
  );

  return (
    <div>
      {/* Event selector */}
      <div className="flex flex-wrap items-end gap-4 mb-6 p-4 bg-white border-2 border-gray-100 rounded-lg">
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-medium text-gray-600 mb-1">Événement</label>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title} — {new Date(ev.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
              </option>
            ))}
          </select>
        </div>
        {canManage && (
          <Button onClick={handleSave} disabled={saving || loadingAttendance}>
            {saving ? "Enregistrement..." : "Enregistrer l'appel"}
          </Button>
        )}
        {saved && <span className="text-sm text-green-600 font-medium">Appel enregistré ✓</span>}
      </div>

      {error && <p className="text-sm text-icc-rouge mb-4">{error}</p>}

      {loadingAttendance ? (
        <p className="text-sm text-gray-400">Chargement...</p>
      ) : discipleships.length === 0 ? (
        <p className="text-sm text-gray-400">Aucun disciple enregistré.</p>
      ) : (
        <div className="space-y-4">
          {Object.values(grouped).map(({ maker, disciples }) => (
            <div key={maker.id} className="bg-white rounded-lg shadow border-2 border-gray-100 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-700">
                  FD : {fullName(maker)}
                </span>
                <span className="ml-3 text-xs text-gray-400">
                  {disciples.filter((d) => presentIds.has(d.discipleId)).length} / {disciples.length} présent{disciples.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {disciples.map((d) => {
                  const present = presentIds.has(d.discipleId);
                  return (
                    <label
                      key={d.id}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                        present ? "bg-green-50" : "hover:bg-gray-50"
                      } ${!canManage ? "pointer-events-none" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={present}
                        onChange={() => canManage && togglePresence(d.discipleId)}
                        disabled={!canManage}
                        className="h-4 w-4 rounded border-gray-300 text-icc-violet focus:ring-icc-violet"
                      />
                      <span className="text-sm font-medium text-gray-900">{fullName(d.disciple)}</span>
                      <span className="text-xs text-gray-400">
                        {getDept(d.disciple.departments)?.ministry?.name ?? "??"} / {getDept(d.disciple.departments)?.name ?? "??"}
                      </span>
                      <span className={`ml-auto text-xs font-medium ${present ? "text-green-600" : "text-gray-400"}`}>
                        {present ? "Présent" : "Absent"}
                      </span>
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

function StatsTab({ churchId, canExport }: { churchId: string; canExport: boolean }) {
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

  useEffect(() => { fetchStats(); }, [fetchStats]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/discipleships/export?churchId=${churchId}&from=${from}&to=${to}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert((json as { error?: string }).error ?? "Erreur lors de l'export");
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
      alert("Erreur lors de l'export");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      {/* Period selector */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3 sm:gap-4 mb-6 p-4 bg-white border-2 border-gray-100 rounded-lg">
        <div className="flex gap-3 flex-1">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Du</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Au</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchStats} disabled={loading}>
            {loading ? "Chargement..." : "Actualiser"}
          </Button>
          {canExport && (
            <Button variant="secondary" onClick={handleExport} disabled={exporting}>
              {exporting ? "Export..." : "Exporter Excel"}
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-icc-rouge mb-4">{error}</p>}

      {data && (
        <>
          {data.trackedEvents.length === 0 ? (
            <p className="text-sm text-gray-400">Aucun événement suivi sur cette période.</p>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-3">
                {data.trackedEvents.length} événement{data.trackedEvents.length > 1 ? "s" : ""} suivi{data.trackedEvents.length > 1 ? "s" : ""} sur la période
              </p>
              <div className="bg-white rounded-lg shadow border-2 border-gray-100 overflow-hidden">
                {data.stats.length === 0 ? (
                  <p className="text-sm text-gray-400 p-6">Aucun disciple enregistré.</p>
                ) : (
                  <>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-gray-100 bg-gray-50">
                          <th className="text-left px-4 py-3 font-semibold text-gray-700">Disciple</th>
                          <th className="text-left px-4 py-3 font-semibold text-gray-700">FD</th>
                          <th className="text-left px-4 py-3 font-semibold text-gray-700">Présences / Total</th>
                          <th className="text-left px-4 py-3 font-semibold text-gray-700">Taux</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.stats.map((row) => (
                          <tr key={row.discipleshipId} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-gray-900">{fullName(row.disciple)}</td>
                            <td className="px-4 py-3 text-gray-600">{fullName(row.discipleMaker)}</td>
                            <td className="px-4 py-3 text-gray-600">
                              {row.stats.present} / {row.stats.totalEvents}
                            </td>
                            <td className="px-4 py-3">
                              {row.stats.rate === null ? (
                                <span className="text-gray-400">—</span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        row.stats.rate >= 80
                                          ? "bg-green-500"
                                          : row.stats.rate >= 50
                                          ? "bg-icc-jaune"
                                          : "bg-icc-rouge"
                                      }`}
                                      style={{ width: `${row.stats.rate}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-medium text-gray-700">{row.stats.rate}%</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-gray-100">
                    {data.stats.map((row) => (
                      <div key={row.discipleshipId} className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-gray-900">{fullName(row.disciple)}</div>
                            <div className="text-xs text-gray-400">FD : {fullName(row.discipleMaker)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-gray-700">{row.stats.present}/{row.stats.totalEvents}</div>
                            <div className="text-xs text-gray-400">présences</div>
                          </div>
                        </div>
                        {row.stats.rate !== null && (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  row.stats.rate >= 80
                                    ? "bg-green-500"
                                    : row.stats.rate >= 50
                                    ? "bg-icc-jaune"
                                    : "bg-icc-rouge"
                                }`}
                                style={{ width: `${row.stats.rate}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-gray-700 w-10 text-right">{row.stats.rate}%</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

