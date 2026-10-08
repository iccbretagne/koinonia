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
    <div className="w-12 h-12 rounded-full bg-surface-sunken flex items-center justify-center text-base font-semibold text-ink-muted shrink-0">
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

  /** Ministre : rattache ou change le ministère du rôle existant, sinon crée le rôle. */
  async function submitMinister(selection: ResponsibilitySelection) {
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
  }

  /** Resp. département : ajoute le département au rôle existant, sinon crée le rôle. */
  async function submitDepartmentHead(selection: ResponsibilitySelection) {
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

  async function handleResponsibilitySubmit(selection: ResponsibilitySelection) {
    if (modal?.mode === "minister") {
      await submitMinister(selection);
    } else {
      await submitDepartmentHead(selection);
    }
    setModal(null);
    refresh();
  }

  /** Retire toutes les responsabilités de département, après confirmation. */
  function removeAllDepartmentHeads() {
    if (!confirm("Retirer toutes les responsabilités de département ?")) return;
    fetch(`/api/users/${person.id}/roles`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ churchId, role: "DEPARTMENT_HEAD" }),
    }).then((res) => {
      if (res.ok) {
        setRoles((prev) => prev.filter((r) => r.role !== "DEPARTMENT_HEAD"));
        refresh();
      }
    }).catch(() => setError("Erreur"));
  }

  /** Case d'un rôle : bascule simple, ou choix/retrait d'une responsabilité (Ministre, Resp. département). */
  function handleRoleToggle(role: Role, has: boolean, needsTarget: boolean) {
    if (!needsTarget) {
      void simpleToggle(role);
      return;
    }
    if (!has) {
      setModal({ mode: role === "MINISTER" ? "minister" : "department-head" });
      return;
    }
    if (role === "MINISTER") void removeMinister();
    else if (deptHeadRole) removeAllDepartmentHeads();
  }

  const ministerRole = roleOf("MINISTER");
  const deptHeadRole = roleOf("DEPARTMENT_HEAD");
  const hasResponsibilities = Boolean(ministerRole || deptHeadRole);

  return (
    <div className="space-y-6">
      <Link href="/admin/access" className="text-sm text-brand-text hover:underline">← Retour</Link>

      <div className="flex items-center gap-4 bg-surface rounded-xl border border-line shadow-card p-5">
        <Avatar person={person} />
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-ink truncate">{person.name}</h1>
          <p className="text-sm text-ink-subtle truncate">{person.email}</p>
          {memberLink ? (
            <p className={`text-xs mt-0.5 ${memberLink.validated ? "text-success" : "text-warning"}`}>
              {memberLink.validated ? "✓ Lié à " : "⏳ En attente — "}{memberLink.memberName} (fiche STAR)
            </p>
          ) : (
            <p className="text-xs text-ink-subtle mt-0.5 italic">Aucune fiche STAR liée</p>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Rôles d'église */}
      <div>
        <h2 className="text-sm font-semibold text-ink-muted mb-3">Rôles d&apos;église</h2>
        <div className="space-y-4">
          {CATEGORY_ORDER.map((category) => {
            const categoryRoles = assignableRoles.filter((r) => ROLE_CATEGORY[r] === category);
            if (categoryRoles.length === 0) return null;
            return (
              <div key={category}>
                <p className="text-xs font-medium text-ink-subtle uppercase tracking-wide mb-1.5">
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
                        className="flex items-start gap-3 bg-surface rounded-lg border border-line shadow-card px-4 py-3 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={has}
                          disabled={loading}
                          onChange={() => handleRoleToggle(role, has, needsTarget)}
                          className="mt-0.5 rounded border-control-line text-brand-text focus:ring-focus"
                        />
                        <div className="text-sm font-medium text-ink">
                          {ROLE_LABELS[role]}
                          <span className="block text-xs font-normal text-ink-muted">{ROLE_DESCRIPTIONS[role]}</span>
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
          <h2 className="text-sm font-semibold text-ink-muted mb-3">Responsabilités</h2>
          <div className="space-y-3">
            {ministerRole && (
              <div className="bg-surface rounded-lg border border-line shadow-card px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-ink-subtle">Ministère</p>
                  <p className="text-sm font-medium text-ink">{ministerRole.ministryName ?? "—"}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setModal({ mode: "minister" })}
                    className="text-xs px-2.5 py-1 rounded-md font-medium border border-line text-ink-muted hover:bg-surface-sunken"
                  >
                    Changer
                  </button>
                  <button
                    onClick={removeMinister}
                    className="text-xs px-2.5 py-1 rounded-md font-medium border border-danger/30 text-danger hover:bg-danger-soft"
                  >
                    Retirer
                  </button>
                </div>
              </div>
            )}
            {deptHeadRole && (
              <div className="bg-surface rounded-lg border border-line shadow-card px-4 py-3">
                <p className="text-xs text-ink-subtle mb-2">Départements</p>
                <div className="flex flex-wrap gap-2">
                  {deptHeadRole.departments.map((d) => (
                    <span
                      key={d.id}
                      className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium border bg-surface-sunken text-ink-muted border-line"
                    >
                      {d.name}
                      {d.isDeputy && <span className="opacity-60 font-normal">· adj.</span>}
                      <button onClick={() => removeDeptHead(d.id)} className="ml-0.5 opacity-60 hover:opacity-100 hover:text-danger" title="Retirer">×</button>
                    </span>
                  ))}
                  <button
                    onClick={() => setModal({ mode: "department-head" })}
                    className="text-xs px-2.5 py-1 rounded-md font-medium border border-line text-ink-muted hover:bg-surface-sunken"
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
          <h2 className="text-sm font-semibold text-ink-muted mb-3">Accès hérités</h2>
          <p className="text-xs text-ink-subtle mb-2">
            Ces accès ne viennent pas d&apos;un rôle attribué ci-dessus — lecture seule.
          </p>
          <div className="space-y-2">
            {inheritedAccess.map((access) => (
              <div key={`${access.label}-${access.origin}`} className="bg-surface-sunken rounded-lg border border-line px-4 py-3">
                <p className="text-sm font-medium text-ink">{access.label}</p>
                <p className="text-xs text-ink-muted mt-0.5">{access.origin}</p>
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
