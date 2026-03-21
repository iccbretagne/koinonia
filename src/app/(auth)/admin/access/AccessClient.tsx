"use client";

import { useState } from "react";
import Image from "next/image";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserBasic {
  id: string;
  name: string | null;
  displayName: string | null;
  email: string;
  image: string | null;
}

interface RoleEntry {
  roleId: string;
  user: UserBasic;
  allDepartmentIds?: string[]; // pour les dept heads uniquement
}

interface DeptData {
  id: string;
  name: string;
  heads: RoleEntry[];
}

interface MinistryData {
  id: string;
  name: string;
  ministers: RoleEntry[];
  departments: DeptData[];
}

type AssignTarget =
  | { type: "minister"; ministryId: string; ministryName: string }
  | { type: "dept_head"; deptId: string; deptName: string };

interface Props {
  churchId: string;
  canManage: boolean;
  ministries: MinistryData[];
  allUsers: UserBasic[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function norm(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function displayUser(u: UserBasic) {
  return u.displayName || u.name || u.email;
}

// ─── Composant ────────────────────────────────────────────────────────────────

export default function AccessClient({ churchId, canManage, ministries: initial, allUsers }: Props) {
  const [ministries, setMinistries] = useState<MinistryData[]>(initial);
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [search, setSearch] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Recherche utilisateurs dans le modal ────────────────────────────────────
  const filteredUsers = search.length < 1
    ? allUsers
    : allUsers.filter((u) => {
        const q = norm(search);
        return norm(displayUser(u)).includes(q) || norm(u.email).includes(q);
      });

  // ── Trouver si un utilisateur a déjà un role DEPARTMENT_HEAD dans l'église ──
  function findExistingDeptHeadRole(userId: string): { roleId: string; allDepartmentIds: string[] } | null {
    for (const m of ministries) {
      for (const d of m.departments) {
        for (const h of d.heads) {
          if (h.user.id === userId) {
            return { roleId: h.roleId, allDepartmentIds: h.allDepartmentIds ?? [] };
          }
        }
      }
    }
    return null;
  }

  // ── Assigner ─────────────────────────────────────────────────────────────────
  async function handleAssign(user: UserBasic) {
    if (!assignTarget) return;
    setAssigning(true);
    setError(null);

    try {
      if (assignTarget.type === "minister") {
        const res = await fetch(`/api/users/${user.id}/roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ churchId, role: "MINISTER", ministryId: assignTarget.ministryId }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Erreur"); }
        const saved = await res.json();

        setMinistries((prev) => prev.map((m) =>
          m.id === assignTarget.ministryId
            ? { ...m, ministers: [...m.ministers, { roleId: saved.id, user }] }
            : m
        ));
      } else {
        // dept_head : vérifier si user a déjà un rôle DEPARTMENT_HEAD
        const existing = findExistingDeptHeadRole(user.id);

        if (existing) {
          // PATCH pour ajouter ce département à leur liste
          if (existing.allDepartmentIds.includes(assignTarget.deptId)) {
            setError("Cet utilisateur est déjà responsable de ce département.");
            return;
          }
          const newDepts = [...existing.allDepartmentIds, assignTarget.deptId];
          const res = await fetch(`/api/users/${user.id}/roles`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roleId: existing.roleId, departmentIds: newDepts }),
          });
          if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Erreur"); }

          // Mettre à jour allDepartmentIds pour tous les depts de ce user
          setMinistries((prev) => prev.map((m) => ({
            ...m,
            departments: m.departments.map((d) => ({
              ...d,
              heads: d.heads.map((h) =>
                h.user.id === user.id ? { ...h, allDepartmentIds: newDepts } : h
              ),
            })),
          })));
          // Ajouter l'entrée dans le nouveau département
          setMinistries((prev) => prev.map((m) => ({
            ...m,
            departments: m.departments.map((d) =>
              d.id === assignTarget.deptId
                ? { ...d, heads: [...d.heads, { roleId: existing.roleId, user, allDepartmentIds: newDepts }] }
                : d
            ),
          })));
        } else {
          // Nouveau rôle DEPARTMENT_HEAD
          const res = await fetch(`/api/users/${user.id}/roles`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ churchId, role: "DEPARTMENT_HEAD", departmentIds: [assignTarget.deptId] }),
          });
          if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Erreur"); }
          const saved = await res.json();

          setMinistries((prev) => prev.map((m) => ({
            ...m,
            departments: m.departments.map((d) =>
              d.id === assignTarget.deptId
                ? { ...d, heads: [...d.heads, { roleId: saved.id, user, allDepartmentIds: [assignTarget.deptId] }] }
                : d
            ),
          })));
        }
      }

      setAssignTarget(null);
      setSearch("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setAssigning(false);
    }
  }

  // ── Retirer un ministre ───────────────────────────────────────────────────────
  async function handleRemoveMinister(ministryId: string, entry: RoleEntry) {
    if (!confirm(`Retirer ${displayUser(entry.user)} du rôle de Ministre ?`)) return;
    try {
      const res = await fetch(`/api/users/${entry.user.id}/roles`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ churchId, role: "MINISTER" }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error ?? "Erreur"); return; }
      setMinistries((prev) => prev.map((m) =>
        m.id === ministryId
          ? { ...m, ministers: m.ministers.filter((r) => r.roleId !== entry.roleId) }
          : m
      ));
    } catch { alert("Erreur"); }
  }

  // ── Retirer un responsable de département ────────────────────────────────────
  async function handleRemoveDeptHead(deptId: string, entry: RoleEntry) {
    if (!confirm(`Retirer ${displayUser(entry.user)} de ce département ?`)) return;
    try {
      const newDepts = (entry.allDepartmentIds ?? []).filter((id) => id !== deptId);

      if (newDepts.length === 0) {
        // Supprimer le rôle complètement
        const res = await fetch(`/api/users/${entry.user.id}/roles`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ churchId, role: "DEPARTMENT_HEAD" }),
        });
        if (!res.ok) { const d = await res.json(); alert(d.error ?? "Erreur"); return; }
      } else {
        // PATCH pour retirer ce département
        const res = await fetch(`/api/users/${entry.user.id}/roles`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleId: entry.roleId, departmentIds: newDepts }),
        });
        if (!res.ok) { const d = await res.json(); alert(d.error ?? "Erreur"); return; }
        // Mettre à jour allDepartmentIds dans les autres depts du même user
        setMinistries((prev) => prev.map((m) => ({
          ...m,
          departments: m.departments.map((d) => ({
            ...d,
            heads: d.heads.map((h) =>
              h.user.id === entry.user.id ? { ...h, allDepartmentIds: newDepts } : h
            ),
          })),
        })));
      }

      // Retirer du dept ciblé
      setMinistries((prev) => prev.map((m) => ({
        ...m,
        departments: m.departments.map((d) =>
          d.id === deptId ? { ...d, heads: d.heads.filter((h) => h.user.id !== entry.user.id) } : d
        ),
      })));
    } catch { alert("Erreur"); }
  }

  return (
    <>
      {/* ── Liste ministères ──────────────────────────────────────────────── */}
      <div className="space-y-6">
        {ministries.map((ministry) => (
          <div key={ministry.id} className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
            {/* En-tête ministère */}
            <div className="px-5 py-4 bg-icc-violet/5 border-b border-icc-violet/10 flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold text-gray-900">{ministry.name}</h2>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Badges ministres */}
                {ministry.ministers.map((entry) => (
                  <UserBadge
                    key={entry.roleId}
                    user={entry.user}
                    label="Ministre"
                    color="icc-violet"
                    onRemove={canManage ? () => handleRemoveMinister(ministry.id, entry) : undefined}
                  />
                ))}
                {ministry.ministers.length === 0 && (
                  <span className="text-xs text-gray-400 italic">Aucun ministre assigné</span>
                )}
                {canManage && (
                  <button
                    onClick={() => { setAssignTarget({ type: "minister", ministryId: ministry.id, ministryName: ministry.name }); setSearch(""); setError(null); }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-icc-violet border border-icc-violet/30 rounded-full hover:bg-icc-violet hover:text-white transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Ministre
                  </button>
                )}
              </div>
            </div>

            {/* Départements */}
            <div className="divide-y divide-gray-50">
              {ministry.departments.map((dept) => (
                <div key={dept.id} className="px-5 py-3 flex items-center gap-4 flex-wrap">
                  <span className="text-sm font-medium text-gray-700 w-40 shrink-0">{dept.name}</span>

                  <div className="flex items-center gap-2 flex-wrap flex-1">
                    {dept.heads.map((entry) => (
                      <UserBadge
                        key={`${entry.roleId}-${dept.id}`}
                        user={entry.user}
                        label="Resp."
                        color="gray"
                        onRemove={canManage ? () => handleRemoveDeptHead(dept.id, entry) : undefined}
                      />
                    ))}
                    {dept.heads.length === 0 && (
                      <span className="text-xs text-gray-400 italic">—</span>
                    )}
                    {canManage && (
                      <button
                        onClick={() => { setAssignTarget({ type: "dept_head", deptId: dept.id, deptName: dept.name }); setSearch(""); setError(null); }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-gray-500 border border-gray-200 rounded-full hover:bg-gray-100 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Responsable
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {ministry.departments.length === 0 && (
                <p className="px-5 py-3 text-sm text-gray-400 italic">Aucun département</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Modale d'assignation ──────────────────────────────────────────── */}
      {assignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">
                {assignTarget.type === "minister"
                  ? `Assigner un ministre — ${assignTarget.ministryName}`
                  : `Assigner un responsable — ${assignTarget.deptName}`}
              </h3>
            </div>

            <div className="p-4 space-y-3">
              <Input
                placeholder="Rechercher un utilisateur..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setError(null); }}
                autoFocus
              />

              {error && <p className="text-sm text-icc-rouge">{error}</p>}

              <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                {filteredUsers.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">Aucun résultat</p>
                ) : (
                  filteredUsers.map((u) => (
                    <button
                      key={u.id}
                      disabled={assigning}
                      onClick={() => handleAssign(u)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-icc-violet/5 transition-colors disabled:opacity-50"
                    >
                      {u.image ? (
                        <Image src={u.image} alt="" width={28} height={28} className="rounded-full shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                          <span className="text-xs text-gray-500 font-medium">
                            {(u.displayName || u.name || u.email)[0].toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{displayUser(u)}</p>
                        <p className="text-xs text-gray-400 truncate">{u.email}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <Button variant="secondary" onClick={() => { setAssignTarget(null); setSearch(""); }}>
                Annuler
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Composant badge utilisateur ──────────────────────────────────────────────

function UserBadge({
  user,
  label,
  color,
  onRemove,
}: {
  user: UserBasic;
  label: string;
  color: "icc-violet" | "gray";
  onRemove?: () => void;
}) {
  const colorClasses = color === "icc-violet"
    ? "bg-icc-violet/10 text-icc-violet border-icc-violet/20"
    : "bg-gray-100 text-gray-700 border-gray-200";

  return (
    <span className={`inline-flex items-center gap-1.5 pl-2 pr-1.5 py-1 text-xs font-medium rounded-full border ${colorClasses}`}>
      {user.image ? (
        <Image src={user.image} alt="" width={16} height={16} className="rounded-full" />
      ) : (
        <span className="w-4 h-4 rounded-full bg-current/20 flex items-center justify-center text-[10px]">
          {(user.displayName || user.name || user.email)[0].toUpperCase()}
        </span>
      )}
      {user.displayName || user.name || user.email}
      <span className="opacity-50">· {label}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 transition-colors"
          title="Retirer"
        >
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}
