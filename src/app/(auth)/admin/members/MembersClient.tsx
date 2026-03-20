"use client";

import { useState, useEffect, useRef } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import DataTable from "@/components/ui/DataTable";
import BulkActionBar from "@/components/ui/BulkActionBar";

type UserResult = { id: string; name: string | null; email: string; displayName: string | null; image: string | null };

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  churchId: string;
  department: {
    id: string;
    name: string;
    ministry: { id: string; name: string };
  };
  userLink: { userId: string; userName: string | null; userEmail: string } | null;
}

interface Props {
  initialMembers: Member[];
  departments: { id: string; name: string; ministryName: string }[];
  readOnly?: boolean;
}

export default function MembersClient({ initialMembers, departments, readOnly = false }: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [filterDept, setFilterDept] = useState("");
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

  function openCreate() {
    setEditing(null);
    setFirstName("");
    setLastName("");
    setDepartmentId(departments[0]?.id || "");
    setError("");
    setModalOpen(true);
  }

  function openEdit(m: Member) {
    setEditing(m);
    setFirstName(m.firstName);
    setLastName(m.lastName);
    setDepartmentId(m.department.id);
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
        body: JSON.stringify({ firstName, lastName, departmentId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur");
      }

      const saved = await res.json();

      if (editing) {
        setMembers((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
      } else {
        setMembers((prev) => [...prev, saved]);
      }

      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
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
    if (bulkDepartmentId) data.departmentId = bulkDepartmentId;

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
          const updated = { ...m, ...data };
          if (data.departmentId) {
            const dept = departments.find((d) => d.id === data.departmentId);
            if (dept) {
              updated.department = {
                id: dept.id,
                name: dept.name,
                ministry: m.department.ministry,
              };
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

  const filtered = filterDept
    ? members.filter((m) => m.department.id === filterDept)
    : members;

  return (
    <>
      <div className="mb-4 flex items-center gap-4">
        {!readOnly && <Button onClick={openCreate}>Nouveau STAR</Button>}
        <div className="w-64">
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
      </div>

      <div className="bg-white rounded-lg shadow">
        <DataTable
          columns={[
            { header: "Nom", accessor: "lastName" },
            { header: "Prénom", accessor: "firstName" },
            {
              header: "Département",
              accessor: (m: Member) => m.department.name,
            },
            {
              header: "Ministère",
              accessor: (m: Member) => m.department.ministry.name,
            },
            {
              header: "Compte",
              accessor: (m: Member) =>
                m.userLink ? (
                  <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                    {m.userLink.userName ?? m.userLink.userEmail}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">—</span>
                ),
            },
          ]}
          data={filtered}
          emptyMessage="Aucun STAR."
          selectable={!readOnly}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          actions={readOnly ? undefined : (m) => (
            <div className="flex gap-2 justify-end">
              {!m.userLink && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setLinkModal(m); setUserQuery(""); setSelectedUser(null); setUserResults([]); setLinkError(null); }}
                >
                  Lier
                </Button>
              )}
              <Button variant="secondary" onClick={() => openEdit(m)}>
                Modifier
              </Button>
              <Button variant="danger" onClick={() => handleDelete(m)}>
                Supprimer
              </Button>
            </div>
          )}
        />
      </div>

      <BulkActionBar
        count={selectedIds.size}
        onEdit={openBulkEdit}
        onDelete={handleBulkDelete}
        onClear={() => setSelectedIds(new Set())}
      />

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
            label="Département"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            options={departments.map((d) => ({
              value: d.id,
              label: `${d.name} (${d.ministryName})`,
            }))}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setModalOpen(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal lien compte */}
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
            label="Département"
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
            <Button
              variant="secondary"
              type="button"
              onClick={() => setBulkModalOpen(false)}
            >
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
