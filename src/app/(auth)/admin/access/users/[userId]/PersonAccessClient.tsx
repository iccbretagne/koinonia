"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Plus, X } from "lucide-react";
import type { Role } from "@/generated/prisma/client";
import { Alert, Button, Checkbox, IconButton, StatusChip, buttonClasses } from "@/components/ui";
import { useConfirm } from "../../../use-confirm";
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
    <div className="w-12 h-12 rounded-full bg-brand-soft flex items-center justify-center text-base font-semibold text-brand-text shrink-0">
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
  const [confirmDialog, ask] = useConfirm();

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
    if (!(await ask({ title: "Retirer le rôle de Ministre ?", message: "La personne n'est plus Ministre de son ministère.", confirmLabel: "Retirer le rôle" }))) return;
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
    if (!(await ask({ title: "Retirer cette responsabilité ?", message: "La personne n'est plus responsable de ce département.", confirmLabel: "Retirer la responsabilité" }))) return;
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
  async function removeAllDepartmentHeads() {
    if (
      !(await ask({
        title: "Retirer toutes les responsabilités de département ?",
        message: "La personne perd le rôle Resp. département et tous ses départements.",
        confirmLabel: "Retirer les responsabilités",
      }))
    ) {
      return;
    }
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
    else if (deptHeadRole) void removeAllDepartmentHeads();
  }

  const ministerRole = roleOf("MINISTER");
  const deptHeadRole = roleOf("DEPARTMENT_HEAD");
  const hasResponsibilities = Boolean(ministerRole || deptHeadRole);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/access" className={`${buttonClasses("ghost", "sm")} self-start`}>
        <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
        Revenir aux accès
      </Link>

      <div className="flex items-center gap-4">
        <Avatar person={person} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-[22px] font-bold leading-7 text-ink">{person.name}</h1>
          <p className="truncate text-[13px] leading-[18px] text-ink-muted">{person.email}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {memberLink ? (
              <>
                <StatusChip tone={memberLink.validated ? "success" : "warning"}>{memberLink.validated ? "Fiche STAR liée" : "Liaison en attente"}</StatusChip>
                <span className="text-[13px] leading-[18px] text-ink-muted">{memberLink.memberName}</span>
              </>
            ) : (
              <StatusChip>Aucune fiche STAR liée</StatusChip>
            )}
          </div>
        </div>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      {/* Rôles d'église */}
      <section>
        <h2 className="mb-3 font-display text-[17px] font-semibold leading-6 text-ink">Rôles d&apos;église</h2>
        <div className="flex flex-col gap-4">
          {CATEGORY_ORDER.map((category) => {
            const categoryRoles = assignableRoles.filter((r) => ROLE_CATEGORY[r] === category);
            if (categoryRoles.length === 0) return null;
            return (
              <div key={category}>
                <p className="mb-1.5 font-display text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-subtle">
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
                        className="flex min-h-11 cursor-pointer items-start gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card"
                      >
                        <Checkbox
                          checked={has}
                          disabled={loading}
                          onChange={() => handleRoleToggle(role, has, needsTarget)}
                          className="mt-0.5"
                        />
                        <div className="text-[15px] font-semibold leading-[22px] text-ink">
                          {ROLE_LABELS[role]}
                          <span className="block text-[13px] font-normal leading-[18px] text-ink-muted">{ROLE_DESCRIPTIONS[role]}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Responsabilités */}
      {hasResponsibilities && (
        <section>
          <h2 className="mb-3 font-display text-[17px] font-semibold leading-6 text-ink">Responsabilités</h2>
          <div className="flex flex-col gap-3">
            {ministerRole && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card">
                <div>
                  <p className="text-[13px] leading-[18px] text-ink-muted">Ministère</p>
                  <p className="text-[15px] font-semibold leading-[22px] text-ink">{ministerRole.ministryName ?? "—"}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setModal({ mode: "minister" })}>
                    Changer de ministère
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={removeMinister}>
                    Retirer
                  </Button>
                </div>
              </div>
            )}
            {deptHeadRole && (
              <div className="rounded-card border border-line bg-surface px-4 py-3 shadow-card">
                <p className="mb-2 text-[13px] leading-[18px] text-ink-muted">Départements</p>
                <div className="flex flex-wrap items-center gap-2">
                  {deptHeadRole.departments.map((d) => (
                    <span key={d.id} className="inline-flex items-center gap-1">
                      <StatusChip>{d.isDeputy ? `${d.name} · adjoint` : d.name}</StatusChip>
                      <IconButton icon={X} aria-label={`Retirer la responsabilité ${d.name}`} onClick={() => removeDeptHead(d.id)} />
                    </span>
                  ))}
                  <Button type="button" variant="ghost" size="sm" onClick={() => setModal({ mode: "department-head" })}>
                    <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
                    Ajouter un département
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Accès hérités */}
      {inheritedAccess.length > 0 && (
        <section>
          <h2 className="mb-1 font-display text-[17px] font-semibold leading-6 text-ink">Accès hérités</h2>
          <p className="mb-3 text-[13px] leading-[18px] text-ink-muted">
            Ces accès ne viennent pas d&apos;un rôle attribué ci-dessus — lecture seule.
          </p>
          <div className="flex flex-col gap-2">
            {inheritedAccess.map((access) => (
              <div key={`${access.label}-${access.origin}`} className="rounded-card border border-line bg-surface px-4 py-3">
                <p className="text-[15px] font-semibold leading-[22px] text-ink">{access.label}</p>
                <p className="text-[13px] leading-[18px] text-ink-muted">{access.origin}</p>
              </div>
            ))}
          </div>
        </section>
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
          submitLabel={modal.mode === "minister" ? "Assigner le ministère" : "Ajouter le département"}
        />
      )}
      {confirmDialog}
    </div>
  );
}
