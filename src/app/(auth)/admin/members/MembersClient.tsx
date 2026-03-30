"use client";

import { useState, useEffect, useRef } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import BulkActionBar from "@/components/ui/BulkActionBar";

type UserResult = { id: string; name: string | null; email: string; displayName: string | null; image: string | null };

interface DeptRef {
  id: string;
  name: string;
  isPrimary: boolean;
  ministry: { id: string; name: string };
}

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  churchId: string;
  primaryDepartment: { id: string; name: string; ministry: { id: string; name: string } } | null;
  allDepartments: DeptRef[];
  userLink: { userId: string; userName: string | null; userEmail: string } | null;
}

interface Props {
  initialMembers: Member[];
  departments: { id: string; name: string; ministryName: string }[];
  readOnly?: boolean;
}

const LS_FILTER_DEPT = "members_filter_dept";
const LS_FILTER_SEARCH = "members_filter_search";

export default function MembersClient({ initialMembers, departments, readOnly = false }: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id || "");
  const [additionalDeptIds, setAdditionalDeptIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [filterDept, setFilterDept] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem(LS_FILTER_DEPT) ?? "";
    return "";
  });
  const [search, setSearch] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem(LS_FILTER_SEARCH) ?? "";
    return "";
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkFirstName, setBulkFirstName] = useState("");
  const [bulkLastName, setBulkLastName] = useState("");
  const [bulkDepartmentId, setBulkDepartmentId] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  // Link user modal
  const [linkModal, setLinkModal] = useState<Member | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [userSearching, setUserSearching] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const userSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist filters
  useEffect(() => { localStorage.setItem(LS_FILTER_DEPT, filterDept); }, [filterDept]);
  useEffect(() => { localStorage.setItem(LS_FILTER_SEARCH, search); }, [search]);

  useEffect(() => {
    if (!linkModal || userQuery.length < 2) { setUserResults([]); return; }
    if (userSearchTimer.current) clearTimeout(userSearchTimer.current);
    userSearchTimer.current = setTimeout(async () => {
      setUserSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(userQuery)}&churchId=${linkModal.churchId}`);
        const json = await res.json();
        setUserResults(Array.isArray(json) ? json : []);
      } finally {
        setUserSearching(false);
      }
    }, 300);
  }, [userQuery, linkModal]);

  async function handleLink() {
    if (!linkModal || !selectedUser) return;
    setLinkError(null);
    setLinkLoading(true);
    try {
      const res = await fetch("/api/member-user-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: linkModal.id, userId: selectedUser.id, churchId: linkModal.churchId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setMembers((prev) => prev.map((m) =>
        m.id === linkModal.id
          ? { ...m, userLink: { userId: selectedUser.id, userName: selectedUser.name, userEmail: selectedUser.email } }
          : m
      ));
      setLinkModal(null);
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLinkLoading(false);
    }
  }

  function toggleAdditionalDept(deptId: string) {
    setAdditionalDeptIds((prev) =>
      prev.includes(deptId) ? prev.filter((id) => id !== deptId) : [...prev, deptId]
    );
  }

  function openCreate() {
    setEditing(null);
    setFirstName("");
    setLastName("");
    setDepartmentId(departments[0]?.id || "");
    setAdditionalDeptIds([]);
    setError("");
    setModalOpen(true);
  }

  function openEdit(m: Member) {
    setEditing(m);
    setFirstName(m.firstName);
    setLastName(m.lastName);
    const primaryId = m.primaryDepartment?.id ?? m.allDepartments[0]?.id ?? departments[0]?.id ?? "";
    setDepartmentId(primaryId);
    setAdditionalDeptIds(m.allDepartments.filter((d) => !d.isPrimary).map((d) => d.id));
    setError("");
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const url = editing ? `/api/members/${editing.id}` : "/api/members";
      const method = editing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          departmentId,
          additionalDepartmentIds: additionalDeptIds.filter((id) => id !== departmentId),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur");
      }

      const saved = await res.json();
      const normalizedMember = normalizeMember(saved);

      if (editing) {
        setMembers((prev) => prev.map((m) => (m.id === normalizedMember.id ? normalizedMember : m)));
      } else {
        setMembers((prev) => [...prev, normalizedMember]);
      }

      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  function normalizeMember(raw: {
    id: string;
    firstName: string;
    lastName: string;
    departments?: { isPrimary: boolean; department: { id: string; name: string; ministry: { id: string; name: string; churchId?: string } } }[];
    userLink?: { userId: string; userName?: string | null; userEmail?: string; user?: { name: string | null; email: string } } | null;
    churchId?: string;
  }): Member {
    const depts = raw.departments ?? [];
    const primaryDept = depts.find((d) => d.isPrimary) ?? depts[0];
    return {
      id: raw.id,
      firstName: raw.firstName,
      lastName: raw.lastName,
      churchId: raw.churchId ?? primaryDept?.department.ministry.churchId ?? "",
      primaryDepartment: primaryDept
        ? { id: primaryDept.department.id, name: primaryDept.department.name, ministry: primaryDept.department.ministry }
        : null,
      allDepartments: depts.map((d) => ({
        id: d.department.id,
        name: d.department.name,
        isPrimary: d.isPrimary,
        ministry: d.department.ministry,
      })),
      userLink: raw.userLink
        ? {
            userId: raw.userLink.userId,
            userName: raw.userLink.userName ?? raw.userLink.user?.name ?? null,
            userEmail: raw.userLink.userEmail ?? raw.userLink.user?.email ?? "",
          }
        : null,
    };
  }

  async function handleUnlink(m: Member) {
    if (!confirm(`Délier le compte de ${m.firstName} ${m.lastName} ?`)) return;
    try {
      const res = await fetch("/api/member-user-links", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: m.id, churchId: m.churchId }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur lors de la déliaison");
        return;
      }
      setMembers((prev) => prev.map((x) => x.id === m.id ? { ...x, userLink: null } : x));
    } catch {
      alert("Erreur lors de la déliaison");
    }
  }

  async function handleDelete(m: Member) {
    if (!confirm(`Supprimer ${m.firstName} ${m.lastName} ?`)) return;
    try {
      const res = await fetch(`/api/members/${m.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur lors de la suppression");
        return;
      }
      setMembers((prev) => prev.filter((x) => x.id !== m.id));
    } catch {
      alert("Erreur lors de la suppression");
    }
  }

  async function handleBulkDelete() {
    if (!confirm(`Supprimer ${selectedIds.size} STAR ?`)) return;
    try {
      const res = await fetch("/api/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action: "delete" }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur lors de la suppression");
        return;
      }
      setMembers((prev) => prev.filter((m) => !selectedIds.has(m.id)));
      setSelectedIds(new Set());
    } catch {
      alert("Erreur lors de la suppression");
    }
  }

  function openBulkEdit() {
    setBulkFirstName("");
    setBulkLastName("");
    setBulkDepartmentId("");
    setBulkError("");
    setBulkModalOpen(true);
  }

  async function handleBulkEdit(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string, string> = {};
    if (bulkFirstName) data.firstName = bulkFirstName;
    if (bulkLastName) data.lastName = bulkLastName;
    if (bulkDepartmentId) data.primaryDepartmentId = bulkDepartmentId;

    if (Object.keys(data).length === 0) {
      setBulkError("Remplissez au moins un champ");
      return;
    }

    setBulkLoading(true);
    setBulkError("");

    try {
      const res = await fetch("/api/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action: "update", data }),
      });

      if (!res.ok) {
        const resp = await res.json();
        throw new Error(resp.error || "Erreur");
      }

      setMembers((prev) =>
        prev.map((m) => {
          if (!selectedIds.has(m.id)) return m;
          const updated = { ...m };
          if (data.firstName) updated.firstName = data.firstName;
          if (data.lastName) updated.lastName = data.lastName;
          if (data.primaryDepartmentId) {
            const dept = departments.find((d) => d.id === data.primaryDepartmentId);
            if (dept) {
              updated.primaryDepartment = { id: dept.id, name: dept.name, ministry: m.primaryDepartment?.ministry ?? { id: "", name: dept.ministryName } };
              updated.allDepartments = updated.allDepartments.map((d) => ({
                ...d,
                isPrimary: d.id === data.primaryDepartmentId,
              }));
              if (!updated.allDepartments.find((d) => d.id === data.primaryDepartmentId)) {
                updated.allDepartments = [
                  { id: dept.id, name: dept.name, isPrimary: true, ministry: { id: "", name: dept.ministryName } },
                  ...updated.allDepartments,
                ];
              }
            }
          }
          return updated;
        })
      );
      setSelectedIds(new Set());
      setBulkModalOpen(false);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBulkLoading(false);
    }
  }

  const filtered = members
    .filter((m) => {
      if (filterDept && !m.allDepartments.some((d) => d.id === filterDept)) return false;
      if (search) {
        const q = search.toLowerCase();
        const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
        if (!fullName.includes(q) && !`${m.lastName} ${m.firstName}`.toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "fr"));

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((m) => m.id)));
    }
  }

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {!readOnly && <Button onClick={openCreate}>Nouveau STAR</Button>}
        <div className="flex-1 min-w-0">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un STAR..."
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
          />
        </div>
        <div className="w-full sm:w-64">
          <Select
            label=""
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            placeholder="Tous les départements"
            options={departments.map((d) => ({
              value: d.id,
              label: `${d.name} (${d.ministryName})`,
            }))}
          />
        </div>
        {(search || filterDept) && (
          <button
            onClick={() => { setSearch(""); setFilterDept(""); }}
            className="text-sm text-gray-400 hover:text-gray-600 whitespace-nowrap"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Count + select all */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">
          {filtered.length} STAR{filtered.length > 1 ? "s" : ""}
          {(search || filterDept) && ` sur ${members.length}`}
        </p>
        {!readOnly && filtered.length > 0 && (
          <button
            onClick={toggleSelectAll}
            className="text-sm text-icc-violet hover:underline"
          >
            {selectedIds.size === filtered.length ? "Tout désélectionner" : "Tout sélectionner"}
          </button>
        )}
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div className="p-8 text-center text-gray-400 border-2 border-gray-200 border-dashed rounded-lg">
          Aucun STAR.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m) => {
            const isSelected = selectedIds.has(m.id);
            const secondaryDepts = m.allDepartments.filter((d) => !d.isPrimary);
            return (
              <div
                key={m.id}
                className={`bg-white rounded-xl border-2 p-4 flex flex-col gap-3 transition-colors ${
                  isSelected ? "border-icc-violet bg-icc-violet/5" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                {/* Header: checkbox + name */}
                <div className="flex items-start gap-3">
                  {!readOnly && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(m.id)}
                      className="mt-0.5 rounded border-gray-300 text-icc-violet focus:ring-icc-violet shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">
                      {m.lastName} {m.firstName}
                    </p>
                    {m.userLink ? (
                      <p className="text-xs text-green-700 truncate mt-0.5">
                        {m.userLink.userName ?? m.userLink.userEmail}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-0.5">Non lié</p>
                    )}
                  </div>
                </div>

                {/* Departments */}
                <div className="flex flex-wrap gap-1.5">
                  {m.primaryDepartment && (
                    <span className="text-xs bg-icc-violet/10 text-icc-violet px-2 py-0.5 rounded-full font-medium">
                      {m.primaryDepartment.name}
                      <span className="text-icc-violet/60 ml-1">{m.primaryDepartment.ministry.name}</span>
                    </span>
                  )}
                  {secondaryDepts.map((d) => (
                    <span key={d.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {d.name}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                {!readOnly && (
                  <div className="flex gap-2 flex-wrap pt-1 border-t border-gray-100">
                    {m.userLink ? (
                      <Button variant="secondary" size="sm" onClick={() => handleUnlink(m)}>
                        Délier
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => { setLinkModal(m); setUserQuery(""); setSelectedUser(null); setUserResults([]); setLinkError(null); }}
                      >
                        Lier
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => openEdit(m)}>
                      Modifier
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(m)}>
                      Supprimer
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <BulkActionBar
        count={selectedIds.size}
        onEdit={openBulkEdit}
        onDelete={handleBulkDelete}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* Create / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Modifier le STAR" : "Nouveau STAR"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Prénom"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
          <Input
            label="Nom"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
          <Select
            label="Département principal"
            value={departmentId}
            onChange={(e) => {
              const newPrimary = e.target.value;
              setDepartmentId(newPrimary);
              setAdditionalDeptIds((prev) => prev.filter((id) => id !== newPrimary));
            }}
            options={departments.map((d) => ({
              value: d.id,
              label: `${d.name} (${d.ministryName})`,
            }))}
          />
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Départements supplémentaires</p>
            <div className="space-y-1 max-h-40 overflow-y-auto border-2 border-gray-200 rounded-lg p-2">
              {departments
                .filter((d) => d.id !== departmentId)
                .map((d) => (
                  <label key={d.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                    <input
                      type="checkbox"
                      checked={additionalDeptIds.includes(d.id)}
                      onChange={() => toggleAdditionalDept(d.id)}
                      className="rounded border-gray-300 text-icc-violet focus:ring-icc-violet"
                    />
                    <span className="text-sm text-gray-700">
                      {d.name} <span className="text-gray-400 text-xs">({d.ministryName})</span>
                    </span>
                  </label>
                ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Link user modal */}
      <Modal
        open={!!linkModal}
        onClose={() => setLinkModal(null)}
        title={`Lier un compte à ${linkModal?.firstName} ${linkModal?.lastName}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Recherchez l&apos;utilisateur à lier à ce STAR.
          </p>
          <div>
            <Input
              label="Rechercher un utilisateur"
              value={userQuery}
              onChange={(e) => { setUserQuery(e.target.value); setSelectedUser(null); }}
              placeholder="Nom ou email..."
            />
            {userSearching && <p className="text-xs text-gray-400 mt-1">Recherche...</p>}
            {userResults.length > 0 && !selectedUser && (
              <ul className="mt-1 border-2 border-gray-200 rounded-lg overflow-hidden">
                {userResults.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => { setSelectedUser(u); setUserQuery(u.displayName ?? u.name ?? u.email); setUserResults([]); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-icc-violet/5 transition-colors"
                    >
                      <span className="font-medium">{u.displayName ?? u.name ?? u.email}</span>
                      {(u.displayName ?? u.name) && <span className="text-gray-400 ml-1 text-xs">{u.email}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {userQuery.length >= 2 && !userSearching && userResults.length === 0 && !selectedUser && (
              <p className="text-xs text-gray-400 mt-1">Aucun utilisateur trouvé (déjà liés exclus)</p>
            )}
          </div>
          {linkError && <p className="text-sm text-icc-rouge">{linkError}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setLinkModal(null)}>Annuler</Button>
            <Button onClick={handleLink} disabled={!selectedUser || linkLoading}>
              {linkLoading ? "En cours..." : "Lier"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk edit modal */}
      <Modal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        title={`Modifier ${selectedIds.size} STAR`}
      >
        <p className="text-sm text-gray-500 mb-4">
          Seuls les champs remplis seront modifiés.
        </p>
        <form onSubmit={handleBulkEdit} className="space-y-4">
          <Input
            label="Prénom"
            value={bulkFirstName}
            onChange={(e) => setBulkFirstName(e.target.value)}
            placeholder="Laisser vide pour ne pas modifier"
          />
          <Input
            label="Nom"
            value={bulkLastName}
            onChange={(e) => setBulkLastName(e.target.value)}
            placeholder="Laisser vide pour ne pas modifier"
          />
          <Select
            label="Département principal"
            value={bulkDepartmentId}
            onChange={(e) => setBulkDepartmentId(e.target.value)}
            placeholder="Ne pas modifier"
            options={departments.map((d) => ({
              value: d.id,
              label: `${d.name} (${d.ministryName})`,
            }))}
          />
          {bulkError && <p className="text-sm text-red-600">{bulkError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setBulkModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={bulkLoading}>
              {bulkLoading ? "Enregistrement..." : "Appliquer"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
