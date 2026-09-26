"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Role } from "@/generated/prisma/client";
import {
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_CATEGORY,
  ROLE_CATEGORY_LABELS,
  type RoleCategory,
} from "@/lib/roles";
import type { InheritedAccess } from "@/lib/access-overview";
import ResponsibilityModal, { type ResponsibilitySelection } from "../../ResponsibilityModal";

interface DeptRef {
  id: string;
  name: string;
  isDeputy: boolean;
}

interface PersonRole {
  id: string;
  role: string;
  ministryId: string | null;
  ministryName: string | null;
  departments: DeptRef[];
}

interface Ministry {
  id: string;
  name: string;
  departments: { id: string; name: string }[];
}

interface Props {
  readonly churchId: string;
  readonly person: { id: string; name: string; email: string; image: string | null };
  readonly memberLink: { memberId: string; memberName: string; validated: boolean } | null;
  readonly initialRoles: PersonRole[];
  readonly inheritedAccess: InheritedAccess[];
  readonly assignableRoles: readonly Role[];
  readonly ministries: Ministry[];
}

const CATEGORY_ORDER: RoleCategory[] = ["administration", "responsabilite", "fonction", "membre"];

function Avatar({ person }: { readonly person: { name: string; image: string | null } }) {
  if (person.image) {
    return <Image src={person.image} alt={person.name} width={48} height={48} className="rounded-full shrink-0" />;
  }
  return (
    <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-base font-semibold text-gray-500 shrink-0">
      {person.name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function PersonAccessClient({
  churchId,
  person,
  memberLink,
  initialRoles,
  inheritedAccess,
  assignableRoles,
  ministries,
}: Props) {
  const router = useRouter();
  const [roles, setRoles] = useState<PersonRole[]>(initialRoles);
  const [loadingRole, setLoadingRole] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: "minister" | "department-head" } | null>(null);
  const [error, setError] = useState("");

  const roleOf = (role: string) => roles.find((r) => r.role === role);

  function refresh() {
    router.refresh();
  }

  async function simpleToggle(role: Role) {
    const existing = roleOf(role);
    setLoadingRole(role);
    setError("");
    try {
      if (existing) {
        const res = await fetch(`/api/users/${person.id}/roles`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ churchId, role }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
        setRoles((prev) => prev.filter((r) => r.role !== role));
      } else {
        const res = await fetch(`/api/users/${person.id}/roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ churchId, role }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
        const data = await res.json();
        setRoles((prev) => [...prev, { id: data.id, role, ministryId: null, ministryName: null, departments: [] }]);
      }
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoadingRole(null);
    }
  }

  async function removeMinister() {
    if (!confirm("Retirer ce rôle de Ministre ?")) return;
    setLoadingRole("MINISTER");
    try {
      const res = await fetch(`/api/users/${person.id}/roles`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ churchId, role: "MINISTER" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
      setRoles((prev) => prev.filter((r) => r.role !== "MINISTER"));
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoadingRole(null);
    }
  }

  async function removeDeptHead(deptId: string) {
    const existing = roleOf("DEPARTMENT_HEAD");
    if (!existing) return;
    if (!confirm("Retirer cette responsabilité de département ?")) return;
    const remaining = existing.departments.filter((d) => d.id !== deptId);
    setLoadingRole("DEPARTMENT_HEAD");
    try {
      if (remaining.length === 0) {
        const res = await fetch(`/api/users/${person.id}/roles`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ churchId, role: "DEPARTMENT_HEAD" }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
        setRoles((prev) => prev.filter((r) => r.role !== "DEPARTMENT_HEAD"));
      } else {
        const res = await fetch(`/api/users/${person.id}/roles`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roleId: existing.id,
            departments: remaining.map((d) => ({ id: d.id, isDeputy: d.isDeputy })),
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
        setRoles((prev) => prev.map((r) => (r.role === "DEPARTMENT_HEAD" ? { ...r, departments: remaining } : r)));
      }
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoadingRole(null);
    }
  }

  async function handleResponsibilitySubmit(selection: ResponsibilitySelection) {
    if (modal?.mode === "minister") {
      const existing = roleOf("MINISTER");
      const ministry = ministries.find((m) => m.id === selection.targetId);
      if (existing) {
        const res = await fetch(`/api/users/${person.id}/roles`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleId: existing.id, ministryId: selection.targetId }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
        setRoles((prev) =>
          prev.map((r) =>
            r.role === "MINISTER" ? { ...r, ministryId: selection.targetId, ministryName: ministry?.name ?? null } : r
          )
        );
      } else {
        const res = await fetch(`/api/users/${person.id}/roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ churchId, role: "MINISTER", ministryId: selection.targetId }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
        const data = await res.json();
        setRoles((prev) => [
          ...prev,
          { id: data.id, role: "MINISTER", ministryId: selection.targetId, ministryName: ministry?.name ?? null, departments: [] },
        ]);
      }
    } else {
      const existing = roleOf("DEPARTMENT_HEAD");
      const dept = ministries.flatMap((m) => m.departments).find((d) => d.id === selection.targetId);
      const newEntry = { id: selection.targetId, isDeputy: selection.isDeputy };
      if (existing) {
        const merged = [
          ...existing.departments.filter((d) => d.id !== selection.targetId).map((d) => ({ id: d.id, isDeputy: d.isDeputy })),
          newEntry,
        ];
        const res = await fetch(`/api/users/${person.id}/roles`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleId: existing.id, departments: merged }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
        setRoles((prev) =>
          prev.map((r) =>
            r.role === "DEPARTMENT_HEAD"
              ? { ...r, departments: merged.map((d) => ({ id: d.id, isDeputy: d.isDeputy, name: dept?.name ?? "" })) }
              : r
          )
        );
      } else {
        const res = await fetch(`/api/users/${person.id}/roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ churchId, role: "DEPARTMENT_HEAD", departments: [newEntry] }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
        const data = await res.json();
        setRoles((prev) => [
          ...prev,
          {
            id: data.id,
            role: "DEPARTMENT_HEAD",
            ministryId: null,
            ministryName: null,
            departments: [{ id: selection.targetId, isDeputy: selection.isDeputy, name: dept?.name ?? "" }],
          },
        ]);
      }
    }
    setModal(null);
    refresh();
  }

  const ministerRole = roleOf("MINISTER");
  const deptHeadRole = roleOf("DEPARTMENT_HEAD");
  const hasResponsibilities = Boolean(ministerRole || deptHeadRole);

  return (
    <div className="space-y-6">
      <Link href="/admin/access" className="text-sm text-icc-violet hover:underline">← Retour</Link>

      <div className="flex items-center gap-4 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <Avatar person={person} />
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-gray-900 truncate">{person.name}</h1>
          <p className="text-sm text-gray-400 truncate">{person.email}</p>
          {memberLink ? (
            <p className={`text-xs mt-0.5 ${memberLink.validated ? "text-green-600" : "text-amber-600"}`}>
              {memberLink.validated ? "✓ Lié à " : "⏳ En attente — "}{memberLink.memberName} (fiche STAR)
            </p>
          ) : (
            <p className="text-xs text-gray-400 mt-0.5 italic">Aucune fiche STAR liée</p>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Rôles d'église */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Rôles d&apos;église</h2>
        <div className="space-y-4">
          {CATEGORY_ORDER.map((category) => {
            const categoryRoles = assignableRoles.filter((r) => ROLE_CATEGORY[r] === category);
            if (categoryRoles.length === 0) return null;
            return (
              <div key={category}>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
                  {ROLE_CATEGORY_LABELS[category]}
                </p>
                <div className="space-y-1.5">
                  {categoryRoles.map((role) => {
                    const has = Boolean(roleOf(role));
                    const loading = loadingRole === role;
                    const needsTarget = role === "MINISTER" || role === "DEPARTMENT_HEAD";
                    return (
                      <label
                        key={role}
                        className="flex items-start gap-3 bg-white rounded-lg border border-gray-100 shadow-sm px-4 py-3 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={has}
                          disabled={loading}
                          onChange={() => {
                            if (needsTarget) {
                              if (has) {
                                if (role === "MINISTER") removeMinister();
                                else if (deptHeadRole) {
                                  if (confirm("Retirer toutes les responsabilités de département ?")) {
                                    fetch(`/api/users/${person.id}/roles`, {
                                      method: "DELETE",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ churchId, role: "DEPARTMENT_HEAD" }),
                                    }).then((res) => {
                                      if (res.ok) {
                                        setRoles((prev) => prev.filter((r) => r.role !== "DEPARTMENT_HEAD"));
                                        refresh();
                                      }
                                    });
                                  }
                                }
                              } else {
                                setModal({ mode: role === "MINISTER" ? "minister" : "department-head" });
                              }
                            } else {
                              simpleToggle(role);
                            }
                          }}
                          className="mt-0.5 rounded border-gray-300 text-icc-violet focus:ring-icc-violet"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{ROLE_LABELS[role]}</p>
                          <p className="text-xs text-gray-500">{ROLE_DESCRIPTIONS[role]}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Responsabilités */}
      {hasResponsibilities && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Responsabilités</h2>
          <div className="space-y-3">
            {ministerRole && (
              <div className="bg-white rounded-lg border border-gray-100 shadow-sm px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-gray-400">Ministère</p>
                  <p className="text-sm font-medium text-gray-900">{ministerRole.ministryName ?? "—"}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setModal({ mode: "minister" })}
                    className="text-xs px-2.5 py-1 rounded-md font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    Changer
                  </button>
                  <button
                    onClick={removeMinister}
                    className="text-xs px-2.5 py-1 rounded-md font-medium border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    Retirer
                  </button>
                </div>
              </div>
            )}
            {deptHeadRole && (
              <div className="bg-white rounded-lg border border-gray-100 shadow-sm px-4 py-3">
                <p className="text-xs text-gray-400 mb-2">Départements</p>
                <div className="flex flex-wrap gap-2">
                  {deptHeadRole.departments.map((d) => (
                    <span
                      key={d.id}
                      className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium border bg-gray-100 text-gray-700 border-gray-200"
                    >
                      {d.name}
                      {d.isDeputy && <span className="opacity-60 font-normal">· adj.</span>}
                      <button onClick={() => removeDeptHead(d.id)} className="ml-0.5 opacity-60 hover:opacity-100 hover:text-red-600" title="Retirer">×</button>
                    </span>
                  ))}
                  <button
                    onClick={() => setModal({ mode: "department-head" })}
                    className="text-xs px-2.5 py-1 rounded-md font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    + Ajouter
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Accès hérités */}
      {inheritedAccess.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Accès hérités</h2>
          <p className="text-xs text-gray-400 mb-2">
            Ces accès ne viennent pas d&apos;un rôle attribué ci-dessus — lecture seule.
          </p>
          <div className="space-y-2">
            {inheritedAccess.map((access, i) => (
              <div key={i} className="bg-gray-50 rounded-lg border border-gray-200 px-4 py-3">
                <p className="text-sm font-medium text-gray-800">{access.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{access.origin}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal && (
        <ResponsibilityModal
          open
          onClose={() => setModal(null)}
          title={modal.mode === "minister" ? "Assigner un ministère" : "Ajouter un département"}
          subtitle={person.name}
          mode={modal.mode}
          fixedUserId={person.id}
          fixedUserLabel={person.name}
          targetOptions={
            modal.mode === "minister"
              ? ministries.map((m) => ({ value: m.id, label: m.name }))
              : ministries.flatMap((m) => m.departments.map((d) => ({ value: d.id, label: `${m.name} / ${d.name}` })))
          }
          onSubmit={handleResponsibilitySubmit}
          submitLabel={modal.mode === "minister" ? "Assigner" : "Ajouter"}
        />
      )}
    </div>
  );
}
