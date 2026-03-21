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
  isDeputy: boolean;
  /** Tous les depts liés à ce UserChurchRole — nécessaire pour PATCH */
  allDepartments: { id: string; isDeputy: boolean }[];
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

// ─── Composant principal ──────────────────────────────────────────────────────

export default function AccessClient({ churchId, canManage, ministries: initial, allUsers }: Props) {
  const [ministries, setMinistries] = useState<MinistryData[]>(initial);
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [assignIsDeputy, setAssignIsDeputy] = useState(false);
  const [search, setSearch] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Recherche utilisateurs ─────────────────────────────────────────────────
  const filteredUsers = search.length < 1
    ? allUsers
    : allUsers.filter((u) => {
        const q = norm(search);
        return norm(displayUser(u)).includes(q) || norm(u.email).includes(q);
      });

  // ── Trouver un rôle DEPARTMENT_HEAD existant pour un user ─────────────────
  function findExistingDeptHeadRole(userId: string): { roleId: string; allDepartments: { id: string; isDeputy: boolean }[] } | null {
    for (const m of ministries) {
      for (const d of m.departments) {
        for (const h of d.heads) {
          if (h.user.id === userId) {
            return { roleId: h.roleId, allDepartments: h.allDepartments };
          }
        }
      }
    }
    return null;
  }

  // ── Assigner ──────────────────────────────────────────────────────────────
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
            ? { ...m, ministers: [...m.ministers, { roleId: saved.id, user, isDeputy: false, allDepartments: [] }] }
            : m
        ));
      } else {
        const existing = findExistingDeptHeadRole(user.id);
        const newDept = { id: assignTarget.deptId, isDeputy: assignIsDeputy };

        if (existing) {
          if (existing.allDepartments.some((d) => d.id === assignTarget.deptId)) {
            setError("Cet utilisateur est déjà responsable de ce département.");
            return;
          }
          const newDepts = [...existing.allDepartments, newDept];
          const res = await fetch(`/api/users/${user.id}/roles`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roleId: existing.roleId, departments: newDepts }),
          });
          if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Erreur"); }

          // Mettre à jour allDepartments pour tous les depts de ce user
          setMinistries((prev) => prev.map((m) => ({
            ...m,
            departments: m.departments.map((d) => ({
              ...d,
              heads: d.heads.map((h) =>
                h.user.id === user.id ? { ...h, allDepartments: newDepts } : h
              ),
            })),
          })));
          // Ajouter dans le nouveau dept
          setMinistries((prev) => prev.map((m) => ({
            ...m,
            departments: m.departments.map((d) =>
              d.id === assignTarget.deptId
                ? { ...d, heads: [...d.heads, { roleId: existing.roleId, user, isDeputy: assignIsDeputy, allDepartments: newDepts }] }
                : d
            ),
          })));
        } else {
          const res = await fetch(`/api/users/${user.id}/roles`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ churchId, role: "DEPARTMENT_HEAD", departments: [newDept] }),
          });
          if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Erreur"); }
          const saved = await res.json();
          setMinistries((prev) => prev.map((m) => ({
            ...m,
            departments: m.departments.map((d) =>
              d.id === assignTarget.deptId
                ? { ...d, heads: [...d.heads, { roleId: saved.id, user, isDeputy: assignIsDeputy, allDepartments: [newDept] }] }
                : d
            ),
          })));
        }
      }

      setAssignTarget(null);
      setSearch("");
      setAssignIsDeputy(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setAssigning(false);
    }
  }

  // ── Retirer un ministre ───────────────────────────────────────────────────
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

  // ── Retirer un responsable d'un département ───────────────────────────────
  async function handleRemoveDeptHead(deptId: string, entry: RoleEntry) {
    const label = entry.isDeputy ? "responsable adjoint" : "responsable";
    if (!confirm(`Retirer ${displayUser(entry.user)} comme ${label} de ce département ?`)) return;
    try {
      const newDepts = entry.allDepartments.filter((d) => d.id !== deptId);

      if (newDepts.length === 0) {
        const res = await fetch(`/api/users/${entry.user.id}/roles`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ churchId, role: "DEPARTMENT_HEAD" }),
        });
        if (!res.ok) { const d = await res.json(); alert(d.error ?? "Erreur"); return; }
      } else {
        const res = await fetch(`/api/users/${entry.user.id}/roles`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleId: entry.roleId, departments: newDepts }),
        });
        if (!res.ok) { const d = await res.json(); alert(d.error ?? "Erreur"); return; }
        // Mettre à jour allDepartments dans les autres depts du même user
        setMinistries((prev) => prev.map((m) => ({
          ...m,
          departments: m.departments.map((d) => ({
            ...d,
            heads: d.heads.map((h) =>
              h.user.id === entry.user.id ? { ...h, allDepartments: newDepts } : h
            ),
          })),
        })));
      }

      setMinistries((prev) => prev.map((m) => ({
        ...m,
        departments: m.departments.map((d) =>
          d.id === deptId ? { ...d, heads: d.heads.filter((h) => !(h.user.id === entry.user.id && h.isDeputy === entry.isDeputy)) } : d
        ),
      })));
    } catch { alert("Erreur"); }
  }

  return (
    <>
      <div className="space-y-6">
        {ministries.map((ministry) => (
          <div key={ministry.id} className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
            {/* En-tête ministère + Ministres */}
            <div className="px-5 py-4 bg-icc-violet/5 border-b border-icc-violet/10">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <h2 className="text-base font-semibold text-gray-900">{ministry.name}</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  {ministry.ministers.map((entry) => (
                    <UserBadge
                      key={entry.roleId}
                      user={entry.user}
                      label="Ministre"
                      variant="violet"
                      onRemove={canManage ? () => handleRemoveMinister(ministry.id, entry) : undefined}
                    />
                  ))}
                  {ministry.ministers.length === 0 && (
                    <span className="text-xs text-gray-400 italic">Aucun ministre assigné</span>
                  )}
                  {canManage && (
                    <AddButton
                      label="Ministre"
                      onClick={() => { setAssignTarget({ type: "minister", ministryId: ministry.id, ministryName: ministry.name }); setSearch(""); setError(null); setAssignIsDeputy(false); }}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Lignes de département */}
            <div className="divide-y divide-gray-50">
              {ministry.departments.map((dept) => {
                const principals = dept.heads.filter((h) => !h.isDeputy);
                const deputies = dept.heads.filter((h) => h.isDeputy);
                return (
                  <div key={dept.id} className="px-5 py-3">
                    <div className="flex items-start gap-4 flex-wrap">
                      <span className="text-sm font-medium text-gray-700 w-44 shrink-0 pt-0.5">{dept.name}</span>
                      <div className="flex-1 space-y-1.5">
                        {/* Responsables principaux */}
                        {principals.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-gray-400 w-20 shrink-0">Principal</span>
                            {principals.map((entry) => (
                              <UserBadge
                                key={`${entry.roleId}-${dept.id}-p`}
                                user={entry.user}
                                label="Resp."
                                variant="dark"
                                onRemove={canManage ? () => handleRemoveDeptHead(dept.id, entry) : undefined}
                              />
                            ))}
                          </div>
                        )}
                        {/* Responsables adjoints */}
                        {deputies.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-gray-400 w-20 shrink-0">Adjoint</span>
                            {deputies.map((entry) => (
                              <UserBadge
                                key={`${entry.roleId}-${dept.id}-d`}
                                user={entry.user}
                                label="Adjoint"
                                variant="light"
                                onRemove={canManage ? () => handleRemoveDeptHead(dept.id, entry) : undefined}
                              />
                            ))}
                          </div>
                        )}
                        {dept.heads.length === 0 && (
                          <span className="text-xs text-gray-400 italic">—</span>
                        )}
                        {canManage && (
                          <AddButton
                            label="Responsable"
                            onClick={() => { setAssignTarget({ type: "dept_head", deptId: dept.id, deptName: dept.name }); setSearch(""); setError(null); setAssignIsDeputy(false); }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
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
              {/* Type de responsable (seulement pour les départements) */}
              {assignTarget.type === "dept_head" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setAssignIsDeputy(false)}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg border-2 transition-colors ${!assignIsDeputy ? "border-icc-violet bg-icc-violet/5 text-icc-violet" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
                  >
                    Responsable principal
                  </button>
                  <button
                    onClick={() => setAssignIsDeputy(true)}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg border-2 transition-colors ${assignIsDeputy ? "border-icc-violet bg-icc-violet/5 text-icc-violet" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
                  >
                    Responsable adjoint
                  </button>
                </div>
              )}

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
                            {(displayUser(u))[0].toUpperCase()}
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
              <Button variant="secondary" onClick={() => { setAssignTarget(null); setSearch(""); setAssignIsDeputy(false); }}>
                Annuler
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Sous-composants ─────────────────────────────────────────────────────────

type BadgeVariant = "violet" | "dark" | "light";

function UserBadge({ user, label, variant, onRemove }: { user: UserBasic; label: string; variant: BadgeVariant; onRemove?: () => void }) {
  const cls: Record<BadgeVariant, string> = {
    violet: "bg-icc-violet/10 text-icc-violet border-icc-violet/20",
    dark:   "bg-gray-800 text-white border-gray-700",
    light:  "bg-gray-100 text-gray-600 border-gray-200",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 pl-2 pr-1.5 py-1 text-xs font-medium rounded-full border ${cls[variant]}`}>
      {user.image ? (
        <Image src={user.image} alt="" width={16} height={16} className="rounded-full" />
      ) : (
        <span className="w-4 h-4 rounded-full bg-current/20 flex items-center justify-center text-[10px]">
          {(displayUser(user))[0].toUpperCase()}
        </span>
      )}
      {displayUser(user)}
      <span className="opacity-50">· {label}</span>
      {onRemove && (
        <button onClick={onRemove} className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 transition-colors" title="Retirer">
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-gray-400 border border-dashed border-gray-300 rounded-full hover:border-icc-violet hover:text-icc-violet transition-colors"
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      {label}
    </button>
  );
}
