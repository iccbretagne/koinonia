"use client";

import { useState } from "react";
import Image from "next/image";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeptRef { id: string; name: string; isDeputy: boolean }

interface UserRole {
  id: string;
  role: string;
  ministryId: string | null;
  ministryName: string | null;
  departments: DeptRef[];
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  image: string | null;
  churchRoles: UserRole[];
}

interface Ministry {
  id: string;
  name: string;
  departments: { id: string; name: string }[];
}

interface Props {
  users: UserItem[];
  ministries: Ministry[];
  churchId: string;
}

type Tab = "roles" | "reporters";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Avatar({ user, size = 32 }: { user: Pick<UserItem, "name" | "image">; size?: number }) {
  if (user.image) {
    return (
      <Image src={user.image} alt={user.name} width={size} height={size}
        className="rounded-full shrink-0" />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-500 shrink-0"
    >
      {user.name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function AccessClient({ users, ministries, churchId }: Props) {
  const [tab, setTab] = useState<Tab>("roles");
  const [localUsers, setLocalUsers] = useState(users);

  // ── Modal states ───────────────────────────────────────────────────────────
  const [ministerModal, setMinisterModal] = useState<{ ministryId: string; ministryName: string } | null>(null);
  const [deptModal, setDeptModal] = useState<{ deptId: string; deptName: string } | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isDeputy, setIsDeputy] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");

  // Reporter loading
  const [reporterLoading, setReporterLoading] = useState<string | null>(null);

  // ── Helpers locaux ─────────────────────────────────────────────────────────

  function getMinister(ministryId: string): UserItem[] {
    return localUsers.filter((u) =>
      u.churchRoles.some((r) => r.role === "MINISTER" && r.ministryId === ministryId)
    );
  }

  function getDeptHeads(deptId: string): { user: UserItem; roleId: string; isDeputy: boolean }[] {
    return localUsers.flatMap((u) =>
      u.churchRoles
        .filter((r) => r.role === "DEPARTMENT_HEAD")
        .flatMap((r) =>
          r.departments
            .filter((d) => d.id === deptId)
            .map((d) => ({ user: u, roleId: r.id, isDeputy: d.isDeputy }))
        )
    );
  }

  // ── Assign minister ────────────────────────────────────────────────────────

  async function handleAssignMinister() {
    if (!ministerModal || !selectedUserId) return;
    setModalLoading(true);
    setModalError("");
    try {
      const user = localUsers.find((u) => u.id === selectedUserId)!;
      const existingRole = user.churchRoles.find((r) => r.role === "MINISTER");

      let saved: UserRole;
      if (existingRole) {
        const res = await fetch(`/api/users/${selectedUserId}/roles`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleId: existingRole.id, ministryId: ministerModal.ministryId }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Erreur");
        const data = await res.json();
        saved = { id: data.id, role: "MINISTER", ministryId: data.ministryId, ministryName: ministerModal.ministryName, departments: [] };
      } else {
        const res = await fetch(`/api/users/${selectedUserId}/roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ churchId, role: "MINISTER", ministryId: ministerModal.ministryId }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Erreur");
        const data = await res.json();
        saved = { id: data.id, role: "MINISTER", ministryId: data.ministryId, ministryName: ministerModal.ministryName, departments: [] };
      }

      setLocalUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUserId
            ? {
                ...u,
                churchRoles: existingRole
                  ? u.churchRoles.map((r) => (r.id === existingRole.id ? saved : r))
                  : [...u.churchRoles, saved],
              }
            : u
        )
      );
      setMinisterModal(null);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setModalLoading(false);
    }
  }

  async function handleRemoveMinister(userId: string) {
    if (!confirm("Retirer ce ministre ?")) return;
    const user = localUsers.find((u) => u.id === userId)!;
    const role = user.churchRoles.find((r) => r.role === "MINISTER");
    if (!role) return;
    const res = await fetch(`/api/users/${userId}/roles`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ churchId, role: "MINISTER" }),
    });
    if (!res.ok) return;
    setLocalUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, churchRoles: u.churchRoles.filter((r) => r.id !== role.id) }
          : u
      )
    );
  }

  // ── Assign dept head ───────────────────────────────────────────────────────

  async function handleAssignDeptHead() {
    if (!deptModal || !selectedUserId) return;
    setModalLoading(true);
    setModalError("");
    try {
      const user = localUsers.find((u) => u.id === selectedUserId)!;
      const existingRole = user.churchRoles.find((r) => r.role === "DEPARTMENT_HEAD");

      const newEntry = { id: deptModal.deptId, isDeputy };

      let saved: { id: string; departments: { departmentId: string; isDeputy: boolean; department: { id: string; name: string } }[] };
      if (existingRole) {
        // Add to existing role
        const existingDepts = existingRole.departments.map((d) => ({ id: d.id, isDeputy: d.isDeputy }));
        const allDepts = [...existingDepts, newEntry];
        const res = await fetch(`/api/users/${selectedUserId}/roles`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleId: existingRole.id, departments: allDepts }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Erreur");
        saved = await res.json();
      } else {
        const res = await fetch(`/api/users/${selectedUserId}/roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ churchId, role: "DEPARTMENT_HEAD", departments: [newEntry] }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Erreur");
        saved = await res.json();
      }

      const newDepts: DeptRef[] = saved.departments.map((d) => ({
        id: d.department.id,
        name: d.department.name,
        isDeputy: d.isDeputy,
      }));

      setLocalUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUserId
            ? {
                ...u,
                churchRoles: existingRole
                  ? u.churchRoles.map((r) =>
                      r.id === existingRole.id ? { ...r, departments: newDepts } : r
                    )
                  : [
                      ...u.churchRoles,
                      { id: saved.id, role: "DEPARTMENT_HEAD", ministryId: null, ministryName: null, departments: newDepts },
                    ],
              }
            : u
        )
      );
      setDeptModal(null);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setModalLoading(false);
    }
  }

  async function handleRemoveDeptHead(userId: string, roleId: string, deptId: string) {
    if (!confirm("Retirer ce responsable ?")) return;
    const user = localUsers.find((u) => u.id === userId)!;
    const role = user.churchRoles.find((r) => r.id === roleId);
    if (!role) return;

    const remaining = role.departments.filter((d) => d.id !== deptId);

    if (remaining.length === 0) {
      // Delete the whole role
      const res = await fetch(`/api/users/${userId}/roles`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ churchId, role: "DEPARTMENT_HEAD" }),
      });
      if (!res.ok) return;
      setLocalUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, churchRoles: u.churchRoles.filter((r) => r.id !== roleId) }
            : u
        )
      );
    } else {
      // Patch with remaining
      const res = await fetch(`/api/users/${userId}/roles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleId,
          departments: remaining.map((d) => ({ id: d.id, isDeputy: d.isDeputy })),
        }),
      });
      if (!res.ok) return;
      setLocalUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                churchRoles: u.churchRoles.map((r) =>
                  r.id === roleId ? { ...r, departments: remaining } : r
                ),
              }
            : u
        )
      );
    }
  }

  // ── Toggle Reporter ────────────────────────────────────────────────────────

  async function toggleReporter(user: UserItem) {
    const has = user.churchRoles.some((r) => r.role === "REPORTER");
    setReporterLoading(user.id);
    try {
      if (has) {
        await fetch(`/api/users/${user.id}/roles`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ churchId, role: "REPORTER" }),
        });
        setLocalUsers((prev) =>
          prev.map((u) =>
            u.id === user.id
              ? { ...u, churchRoles: u.churchRoles.filter((r) => r.role !== "REPORTER") }
              : u
          )
        );
      } else {
        const res = await fetch(`/api/users/${user.id}/roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ churchId, role: "REPORTER" }),
        });
        if (res.ok) {
          const data = await res.json();
          setLocalUsers((prev) =>
            prev.map((u) =>
              u.id === user.id
                ? {
                    ...u,
                    churchRoles: [
                      ...u.churchRoles,
                      { id: data.id, role: "REPORTER", ministryId: null, ministryName: null, departments: [] },
                    ],
                  }
                : u
            )
          );
        }
      }
    } finally {
      setReporterLoading(null);
    }
  }

  // ── Open modals ────────────────────────────────────────────────────────────

  function openMinisterModal(ministryId: string, ministryName: string) {
    setSelectedUserId("");
    setModalError("");
    setMinisterModal({ ministryId, ministryName });
  }

  function openDeptModal(deptId: string, deptName: string) {
    setSelectedUserId("");
    setIsDeputy(false);
    setModalError("");
    setDeptModal({ deptId, deptName });
  }

  // Users that can be assigned (not already minister/head in a conflicting way)
  const assignableUsers = localUsers;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Onglets */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(["roles", "reporters"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-icc-violet text-icc-violet"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "roles" ? "Rôles" : "Comptes rendus"}
          </button>
        ))}
      </div>

      {/* ── Onglet Rôles ──────────────────────────────────────────────────── */}
      {tab === "roles" && (
        <div className="space-y-6">
          {ministries.map((ministry) => (
            <div key={ministry.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Ministre */}
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700">{ministry.name}</h3>
                  <div className="flex flex-wrap gap-2 mt-1.5 items-center">
                    <span className="text-xs text-gray-400 shrink-0">Ministre :</span>
                    {getMinister(ministry.id).map((u) => (
                      <span
                        key={u.id}
                        className="inline-flex items-center gap-1.5 text-xs bg-icc-violet/10 text-icc-violet border border-icc-violet/20 px-2 py-0.5 rounded-full font-medium"
                      >
                        <Avatar user={u} size={14} />
                        {u.name}
                        <button
                          onClick={() => handleRemoveMinister(u.id)}
                          className="ml-0.5 opacity-60 hover:opacity-100 hover:text-red-600 transition-colors"
                          title="Retirer"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {getMinister(ministry.id).length === 0 && (
                      <span className="text-xs text-gray-400 italic">Aucun</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => openMinisterModal(ministry.id, ministry.name)}
                  className="text-xs px-3 py-1.5 rounded-md font-medium bg-icc-violet text-white hover:bg-icc-violet-dark transition-colors shrink-0"
                >
                  Assigner un ministre
                </button>
              </div>

              {/* Départements */}
              <div className="divide-y divide-gray-50">
                {ministry.departments.map((dept) => {
                  const heads = getDeptHeads(dept.id);
                  return (
                    <div key={dept.id} className="px-5 py-3 flex items-start gap-4 flex-wrap">
                      <p className="text-sm text-gray-600 w-44 shrink-0 pt-1">{dept.name}</p>
                      <div className="flex flex-wrap gap-2 flex-1 items-center">
                        {heads.map(({ user, roleId, isDeputy: dep }) => (
                          <span
                            key={user.id}
                            className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium border ${
                              dep
                                ? "bg-gray-100 text-gray-600 border-gray-200"
                                : "bg-gray-800 text-white border-gray-700"
                            }`}
                          >
                            <Avatar user={user} size={14} />
                            {user.name}
                            {dep && <span className="opacity-60 font-normal">· adj.</span>}
                            <button
                              onClick={() => handleRemoveDeptHead(user.id, roleId, dept.id)}
                              className="ml-0.5 opacity-60 hover:opacity-100 hover:text-red-400 transition-colors"
                              title="Retirer"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        {heads.length === 0 && (
                          <span className="text-xs text-gray-400 italic">Aucun responsable</span>
                        )}
                        <button
                          onClick={() => openDeptModal(dept.id, dept.name)}
                          className="text-xs px-2.5 py-1 rounded-md font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          + Ajouter
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {ministries.length === 0 && (
            <p className="text-sm text-gray-400 italic text-center py-8">Aucun ministère configuré.</p>
          )}
        </div>
      )}

      {/* ── Onglet Comptes rendus ─────────────────────────────────────────── */}
      {tab === "reporters" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400 mb-4">
            Les utilisateurs avec le rôle <strong>Reporter</strong> peuvent consulter les comptes rendus et statistiques des événements.
          </p>
          {localUsers.map((user) => {
            const isReporter = user.churchRoles.some((r) => r.role === "REPORTER");
            const loading = reporterLoading === user.id;
            return (
              <div key={user.id} className="bg-white rounded-lg border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
                <Avatar user={user} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                  <p className="text-xs text-gray-400 truncate">{user.email}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {isReporter && (
                    <span className="text-xs bg-icc-violet/10 text-icc-violet border border-icc-violet/20 px-2 py-0.5 rounded-full font-medium">
                      Reporter
                    </span>
                  )}
                  <button
                    onClick={() => toggleReporter(user)}
                    disabled={loading}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-50 ${
                      isReporter
                        ? "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                        : "bg-icc-violet text-white hover:bg-icc-violet-dark"
                    }`}
                  >
                    {loading ? "…" : isReporter ? "Retirer" : "Accorder"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modale Assigner un ministre ───────────────────────────────────── */}
      {ministerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Assigner un ministre</h2>
            <p className="text-sm text-gray-500 mb-4">{ministerModal.ministryName}</p>

            <label className="block text-sm font-medium text-gray-700 mb-1">Utilisateur</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet mb-4"
            >
              <option value="">-- Sélectionner --</option>
              {assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>

            {modalError && <p className="text-sm text-red-600 mb-3">{modalError}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setMinisterModal(null)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleAssignMinister}
                disabled={!selectedUserId || modalLoading}
                className="px-4 py-2 text-sm rounded-lg bg-icc-violet text-white hover:bg-icc-violet-dark disabled:opacity-50"
              >
                {modalLoading ? "…" : "Assigner"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modale Ajouter un responsable ─────────────────────────────────── */}
      {deptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Ajouter un responsable</h2>
            <p className="text-sm text-gray-500 mb-4">{deptModal.deptName}</p>

            <label className="block text-sm font-medium text-gray-700 mb-1">Utilisateur</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet mb-4"
            >
              <option value="">-- Sélectionner --</option>
              {assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>

            <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setIsDeputy(false)}
                className={`flex-1 py-2 text-sm rounded-lg border-2 font-medium transition-colors ${
                  !isDeputy
                    ? "border-gray-800 bg-gray-800 text-white"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                Responsable principal
              </button>
              <button
                type="button"
                onClick={() => setIsDeputy(true)}
                className={`flex-1 py-2 text-sm rounded-lg border-2 font-medium transition-colors ${
                  isDeputy
                    ? "border-gray-300 bg-gray-100 text-gray-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                Responsable adjoint
              </button>
            </div>

            {modalError && <p className="text-sm text-red-600 mb-3">{modalError}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeptModal(null)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleAssignDeptHead}
                disabled={!selectedUserId || modalLoading}
                className="px-4 py-2 text-sm rounded-lg bg-icc-violet text-white hover:bg-icc-violet-dark disabled:opacity-50"
              >
                {modalLoading ? "…" : "Ajouter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
