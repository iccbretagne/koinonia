"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import CheckboxGroup from "@/components/ui/CheckboxGroup";
import Modal from "@/components/ui/Modal";

const ROLES = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "ADMIN", label: "Admin" },
  { value: "SECRETARY", label: "Secrétaire" },
  { value: "MINISTER", label: "Ministre" },
  { value: "DEPARTMENT_HEAD", label: "Responsable de département" },
];

const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  ROLES.map((r) => [r.value, r.label])
);

interface UserRole {
  id: string;
  role: string;
  church: { id: string; name: string };
  ministry: { id: string; name: string } | null;
  departments: { id: string; name: string }[];
}

interface UserItem {
  id: string;
  email: string;
  name: string | null;
  displayName: string | null;
  image: string | null;
  churchRoles: UserRole[];
}

interface Props {
  initialUsers: UserItem[];
  churches: { id: string; name: string }[];
  ministries: { id: string; name: string; churchId: string }[];
  departments: { id: string; name: string; churchId: string }[];
  canManageRoles: boolean;
  isSuperAdmin: boolean;
}

export default function UsersClient({
  initialUsers,
  churches,
  ministries,
  departments,
  canManageRoles,
  isSuperAdmin,
}: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [newRole, setNewRole] = useState(ROLES[1].value);
  const [newChurchId, setNewChurchId] = useState(churches[0]?.id || "");
  const [newMinistryId, setNewMinistryId] = useState("");
  const [newDepartmentIds, setNewDepartmentIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // DisplayName edit state
  const [displayNameModalOpen, setDisplayNameModalOpen] = useState(false);
  const [displayNameUserId, setDisplayNameUserId] = useState("");
  const [displayNameValue, setDisplayNameValue] = useState("");
  const [displayNameError, setDisplayNameError] = useState("");
  const [displayNameLoading, setDisplayNameLoading] = useState(false);

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editRole, setEditRole] = useState<UserRole | null>(null);
  const [editUserId, setEditUserId] = useState("");
  const [editMinistryId, setEditMinistryId] = useState("");
  const [editDepartmentIds, setEditDepartmentIds] = useState<string[]>([]);
  const [editError, setEditError] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const availableRoles = isSuperAdmin
    ? ROLES
    : ROLES.filter((r) => r.value !== "SUPER_ADMIN");

  const filteredMinistries = ministries.filter(
    (m) => m.churchId === newChurchId
  );
  const filteredDepartments = departments.filter(
    (d) => d.churchId === newChurchId
  );

  function openAddRole(user: UserItem) {
    setSelectedUser(user);
    setNewRole(availableRoles[0]?.value || "ADMIN");
    setNewChurchId(churches[0]?.id || "");
    setNewMinistryId("");
    setNewDepartmentIds([]);
    setError("");
    setModalOpen(true);
  }

  function openEditDisplayName(user: UserItem) {
    setDisplayNameUserId(user.id);
    setDisplayNameValue(user.displayName || "");
    setDisplayNameError("");
    setDisplayNameModalOpen(true);
  }

  async function handleEditDisplayName(e: React.FormEvent) {
    e.preventDefault();
    setDisplayNameLoading(true);
    setDisplayNameError("");

    try {
      const res = await fetch(`/api/users/${displayNameUserId}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: displayNameValue }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur");
      }

      const saved = await res.json();

      setUsers((prev) =>
        prev.map((u) =>
          u.id === displayNameUserId
            ? { ...u, displayName: saved.displayName }
            : u
        )
      );

      setDisplayNameModalOpen(false);
    } catch (err) {
      setDisplayNameError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setDisplayNameLoading(false);
    }
  }

  function openEditAssignment(userId: string, role: UserRole) {
    setEditUserId(userId);
    setEditRole(role);
    setEditMinistryId(role.ministry?.id || "");
    setEditDepartmentIds(role.departments.map((d) => d.id));
    setEditError("");
    setEditModalOpen(true);
  }

  async function handleAddRole(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    setLoading(true);
    setError("");

    try {
      const payload: Record<string, unknown> = {
        churchId: newChurchId,
        role: newRole,
      };
      if (newRole === "MINISTER" && newMinistryId) {
        payload.ministryId = newMinistryId;
      }
      if (newRole === "DEPARTMENT_HEAD" && newDepartmentIds.length > 0) {
        payload.departmentIds = newDepartmentIds;
      }

      const res = await fetch(`/api/users/${selectedUser.id}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur");
      }

      const saved = await res.json();

      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id
            ? {
                ...u,
                churchRoles: [
                  ...u.churchRoles,
                  {
                    id: saved.id,
                    role: saved.role,
                    church: saved.church,
                    ministry: saved.ministry || null,
                    departments: (saved.departments || []).map(
                      (d: { department: { id: string; name: string } }) =>
                        d.department
                    ),
                  },
                ],
              }
            : u
        )
      );

      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function handleEditAssignment(e: React.FormEvent) {
    e.preventDefault();
    if (!editRole) return;
    setEditLoading(true);
    setEditError("");

    try {
      const payload: Record<string, unknown> = { roleId: editRole.id };
      if (editRole.role === "MINISTER") {
        payload.ministryId = editMinistryId || null;
      }
      if (editRole.role === "DEPARTMENT_HEAD") {
        payload.departmentIds = editDepartmentIds;
      }

      const res = await fetch(`/api/users/${editUserId}/roles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur");
      }

      const saved = await res.json();

      setUsers((prev) =>
        prev.map((u) =>
          u.id === editUserId
            ? {
                ...u,
                churchRoles: u.churchRoles.map((r) =>
                  r.id === editRole.id
                    ? {
                        ...r,
                        ministry: saved.ministry || null,
                        departments: (saved.departments || []).map(
                          (d: {
                            department: { id: string; name: string };
                          }) => d.department
                        ),
                      }
                    : r
                ),
              }
            : u
        )
      );

      setEditModalOpen(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleRemoveRole(
    userId: string,
    churchId: string,
    role: string
  ) {
    if (!confirm(`Supprimer le rôle ${ROLE_LABELS[role] || role} ?`)) return;

    try {
      const res = await fetch(`/api/users/${userId}/roles`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ churchId, role }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur");
        return;
      }

      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                churchRoles: u.churchRoles.filter(
                  (r) => !(r.church.id === churchId && r.role === role)
                ),
              }
            : u
        )
      );
    } catch {
      alert("Erreur");
    }
  }

  function formatRoleBadge(r: UserRole) {
    const roleLabel = ROLE_LABELS[r.role] || r.role;
    let label = `${roleLabel} - ${r.church.name}`;
    if (r.role === "MINISTER" && r.ministry) {
      label += ` (${r.ministry.name})`;
    }
    if (r.role === "DEPARTMENT_HEAD" && r.departments.length > 0) {
      label += ` (${r.departments.map((d) => d.name).join(", ")})`;
    }
    return label;
  }

  const editChurchDepartments = editRole
    ? departments.filter((d) => d.churchId === editRole.church.id)
    : [];
  const editChurchMinistries = editRole
    ? ministries.filter((m) => m.churchId === editRole.church.id)
    : [];

  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  const filteredUsers = users.filter((user) => {
    const displayLabel = user.displayName || user.name || "";
    const searchLower = searchQuery.toLowerCase();

    const matchesSearch =
      !searchQuery ||
      displayLabel.toLowerCase().includes(searchLower) ||
      (user.name || "").toLowerCase().includes(searchLower) ||
      user.email.toLowerCase().includes(searchLower);

    const matchesLetter =
      !activeLetter ||
      displayLabel.toUpperCase().startsWith(activeLetter);

    return matchesSearch && matchesLetter;
  });

  return (
    <>
      <div className="mb-4 space-y-3">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher par nom ou email..."
        />
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setActiveLetter(null)}
            className={`px-2 py-1 text-xs font-medium rounded ${
              activeLetter === null
                ? "bg-icc-violet text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Tous
          </button>
          {LETTERS.map((letter) => (
            <button
              key={letter}
              onClick={() =>
                setActiveLetter(activeLetter === letter ? null : letter)
              }
              className={`px-2 py-1 text-xs font-medium rounded ${
                activeLetter === letter
                  ? "bg-icc-violet text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {letter}
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-500">
          {filteredUsers.length} utilisateur{filteredUsers.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="space-y-4">
        {filteredUsers.map((user) => (
          <div key={user.id} className="bg-white rounded-lg shadow p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-3 min-w-0">
                {user.image && (
                  <img
                    src={user.image}
                    alt=""
                    className="w-8 h-8 rounded-full shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {user.displayName || user.name || "Sans nom"}
                    {user.displayName && user.name && user.displayName !== user.name && (
                      <span className="text-sm text-gray-400 ml-1">({user.name})</span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500 truncate">{user.email}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {canManageRoles && (
                  <>
                    <Button variant="secondary" onClick={() => openEditDisplayName(user)}>
                      Nom d&apos;affichage
                    </Button>
                    <Button variant="secondary" onClick={() => openAddRole(user)}>
                      Ajouter un rôle
                    </Button>
                  </>
                )}
              </div>
            </div>

            {user.churchRoles.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {user.churchRoles.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 rounded-md text-sm text-gray-700"
                  >
                    {formatRoleBadge(r)}
                    {canManageRoles &&
                      (r.role === "MINISTER" ||
                        r.role === "DEPARTMENT_HEAD") && (
                        <button
                          onClick={() => openEditAssignment(user.id, r)}
                          className="ml-1 p-0.5 rounded text-icc-violet hover:bg-icc-violet hover:text-white transition-colors"
                          title="Modifier l'affectation"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      )}
                    {canManageRoles && (
                      <button
                        onClick={() =>
                          handleRemoveRole(user.id, r.church.id, r.role)
                        }
                        className="ml-0.5 p-0.5 rounded text-red-400 hover:bg-red-500 hover:text-white transition-colors"
                        title="Supprimer le rôle"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Aucun rôle</p>
            )}
          </div>
        ))}

        {filteredUsers.length === 0 && (
          <p className="text-center text-gray-500 py-8">
            Aucun utilisateur trouvé.
          </p>
        )}
      </div>

      {/* Add role modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`Ajouter un rôle à ${selectedUser?.name || selectedUser?.email}`}
      >
        <form onSubmit={handleAddRole} className="space-y-4">
          <Select
            label="Rôle"
            value={newRole}
            onChange={(e) => {
              setNewRole(e.target.value);
              setNewMinistryId("");
              setNewDepartmentIds([]);
            }}
            options={availableRoles}
          />
          <Select
            label="Église"
            value={newChurchId}
            onChange={(e) => {
              setNewChurchId(e.target.value);
              setNewMinistryId("");
              setNewDepartmentIds([]);
            }}
            options={churches.map((c) => ({ value: c.id, label: c.name }))}
          />

          {newRole === "MINISTER" && (
            <Select
              label="Ministère"
              value={newMinistryId}
              onChange={(e) => setNewMinistryId(e.target.value)}
              options={filteredMinistries.map((m) => ({
                value: m.id,
                label: m.name,
              }))}
              placeholder="-- Sélectionner un ministère --"
            />
          )}

          {newRole === "DEPARTMENT_HEAD" && (
            <CheckboxGroup
              label="Départements"
              options={filteredDepartments.map((d) => ({
                value: d.id,
                label: d.name,
              }))}
              selected={newDepartmentIds}
              onChange={setNewDepartmentIds}
            />
          )}

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
              {loading ? "Enregistrement..." : "Ajouter"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit displayName modal */}
      <Modal
        open={displayNameModalOpen}
        onClose={() => setDisplayNameModalOpen(false)}
        title="Modifier le nom d'affichage"
      >
        <form onSubmit={handleEditDisplayName} className="space-y-4">
          <Input
            label="Nom d'affichage"
            value={displayNameValue}
            onChange={(e) => setDisplayNameValue(e.target.value)}
            required
          />
          {displayNameError && (
            <p className="text-sm text-red-600">{displayNameError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setDisplayNameModalOpen(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={displayNameLoading}>
              {displayNameLoading ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit assignment modal */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Modifier l'affectation"
      >
        <form onSubmit={handleEditAssignment} className="space-y-4">
          {editRole?.role === "MINISTER" && (
            <Select
              label="Ministère"
              value={editMinistryId}
              onChange={(e) => setEditMinistryId(e.target.value)}
              options={editChurchMinistries.map((m) => ({
                value: m.id,
                label: m.name,
              }))}
              placeholder="-- Aucun ministère --"
            />
          )}

          {editRole?.role === "DEPARTMENT_HEAD" && (
            <CheckboxGroup
              label="Départements"
              options={editChurchDepartments.map((d) => ({
                value: d.id,
                label: d.name,
              }))}
              selected={editDepartmentIds}
              onChange={setEditDepartmentIds}
            />
          )}

          {editError && <p className="text-sm text-red-600">{editError}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setEditModalOpen(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={editLoading}>
              {editLoading ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
