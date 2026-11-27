"use client";

import { SubmitEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Pencil, Plus, X } from "lucide-react";
import {
  Alert,
  Button,
  CheckboxGroup,
  EmptyState,
  FilterChip,
  IconButton,
  Input,
  Modal,
  SearchInput,
  Select,
  StatusChip,
  buttonClasses,
  useToast,
} from "@/components/ui";
import { useConfirm } from "../use-confirm";
import { ROLE_LABELS } from "@/lib/roles";
import type { Role } from "@/generated/prisma/client";

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
  neverConnected: boolean;
  churchRoles: UserRole[];
}

interface Props {
  readonly churchId: string;
  readonly initialUsers: UserItem[];
  readonly ministries: { id: string; name: string; churchId: string }[];
  readonly departments: { id: string; name: string; churchId: string }[];
  readonly canManageRoles: boolean;
}

/** Remplace le ministère et les départements d'un rôle d'un utilisateur. */
function withUpdatedRole(
  users: UserItem[],
  userId: string | null,
  roleId: string,
  update: Pick<UserRole, "ministry" | "departments">
): UserItem[] {
  return users.map((u) =>
    u.id === userId
      ? { ...u, churchRoles: u.churchRoles.map((r) => (r.id === roleId ? { ...r, ...update } : r)) }
      : u
  );
}

export default function UsersClient({
  churchId,
  initialUsers,
  ministries,
  departments,
  canManageRoles,
}: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [confirmDialog, ask] = useConfirm();
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeLetter, setActiveLetter] = useState<string | null>(null);

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

  function openEditDisplayName(user: UserItem) {
    setDisplayNameUserId(user.id);
    setDisplayNameValue(user.displayName || "");
    setDisplayNameError("");
    setDisplayNameModalOpen(true);
  }

  async function handleEditDisplayName(e: SubmitEvent) {
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

  async function handleEditAssignment(e: SubmitEvent) {
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

      const updatedRole = {
        ministry: saved.ministry || null,
        departments: (saved.departments || []).map(
          (d: { department: { id: string; name: string } }) => d.department
        ),
      };
      setUsers((prev) => withUpdatedRole(prev, editUserId, editRole.id, updatedRole));

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
    const label = ROLE_LABELS[role as Role] || role;
    const ok = await ask({
      title: `Retirer le rôle ${label} ?`,
      message: "La personne perd immédiatement les accès liés à ce rôle.",
      confirmLabel: "Retirer le rôle",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/users/${userId}/roles`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ churchId, role }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Erreur lors du retrait du rôle");
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
      toast.success("Rôle retiré");
    } catch {
      toast.error("Erreur lors du retrait du rôle");
    }
  }

  async function handleDeleteUser(userId: string, email: string) {
    const ok = await ask({
      title: `Supprimer le compte préparé pour ${email} ?`,
      message: "Cette action est irréversible.",
      confirmLabel: "Supprimer le compte",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ churchId }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Erreur lors de la suppression");
        return;
      }

      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast.success("Compte supprimé");
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  }

  function formatRoleBadge(r: UserRole) {
    const roleLabel = ROLE_LABELS[r.role as Role] || r.role;
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
      <div className="mb-4 flex flex-col gap-3">
        {canManageRoles && (
          <div className="flex justify-end">
            <Link href="/admin/users/new" className={buttonClasses("primary")}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Créer un utilisateur
            </Link>
          </div>
        )}
        <SearchInput
          aria-label="Rechercher un utilisateur"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher par nom ou email…"
        />
        <div role="group" aria-label="Filtrer par initiale" className="flex flex-wrap gap-1">
          <FilterChip pressed={activeLetter === null} onClick={() => setActiveLetter(null)}>
            Tous
          </FilterChip>
          {LETTERS.map((letter) => (
            <FilterChip
              key={letter}
              pressed={activeLetter === letter}
              onClick={() => setActiveLetter(activeLetter === letter ? null : letter)}
            >
              {letter}
            </FilterChip>
          ))}
        </div>
        <p className="text-[13px] leading-[18px] text-ink-muted">
          {filteredUsers.length} utilisateur{filteredUsers.length > 1 ? "s" : ""}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {filteredUsers.map((user) => (
          <div key={user.id} className="rounded-card border border-line bg-surface p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-3 min-w-0">
                {user.image && (
                  <Image
                    src={user.image}
                    alt=""
                    width={32}
                    height={32}
                    className="rounded-full shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold leading-[22px] text-ink">
                    {user.displayName || user.name || "Sans nom"}
                    {user.displayName && user.name && user.displayName !== user.name && (
                      <span className="ml-1 text-sm font-normal text-ink-muted">({user.name})</span>
                    )}
                    {user.neverConnected && (
                      <StatusChip tone="warning" className="ml-2">Jamais connecté</StatusChip>
                    )}
                  </p>
                  <p className="text-sm text-ink-muted truncate">{user.email}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {canManageRoles && (
                  <Button variant="secondary" size="sm" onClick={() => openEditDisplayName(user)}>
                    Modifier le nom d&apos;affichage
                  </Button>
                )}
                {canManageRoles && user.neverConnected && (
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteUser(user.id, user.email)}>
                    Supprimer
                  </Button>
                )}
              </div>
            </div>

            {user.churchRoles.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {user.churchRoles.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1 rounded-control border border-line py-0.5 pl-2.5 pr-0.5 text-sm text-ink"
                  >
                    {formatRoleBadge(r)}
                    {canManageRoles &&
                      (r.role === "MINISTER" ||
                        r.role === "DEPARTMENT_HEAD") && (
                        <IconButton
                          icon={Pencil}
                          size="sm"
                          aria-label={`Modifier l'affectation : ${formatRoleBadge(r)}`}
                          title="Modifier l'affectation"
                          onClick={() => openEditAssignment(user.id, r)}
                        />
                      )}
                    {canManageRoles && (
                      <IconButton
                        icon={X}
                        size="sm"
                        aria-label={`Retirer le rôle : ${formatRoleBadge(r)}`}
                        title="Retirer le rôle"
                        onClick={() => handleRemoveRole(user.id, r.church.id, r.role)}
                      />
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">Aucun rôle</p>
            )}
          </div>
        ))}

        {filteredUsers.length === 0 && (
          <EmptyState title="Aucun utilisateur trouvé" description="Modifiez la recherche ou l'initiale choisie." />
        )}
      </div>

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
            <Alert tone="danger">{displayNameError}</Alert>
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
              {displayNameLoading ? "Enregistrement…" : "Enregistrer"}
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
              placeholder="Aucun ministère"
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

          {editError && <Alert tone="danger">{editError}</Alert>}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setEditModalOpen(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={editLoading}>
              {editLoading ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </form>
      </Modal>
      {confirmDialog}
    </>
  );
}
