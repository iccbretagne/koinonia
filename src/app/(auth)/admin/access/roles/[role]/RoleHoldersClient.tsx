"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Plus, X } from "lucide-react";
import type { Role } from "@/generated/prisma/client";
import { Alert, Button, EmptyState, IconButton, PageHeader, Select, StatusChip, buttonClasses } from "@/components/ui";
import { useConfirm } from "../../../use-confirm";
import ResponsibilityModal, { type ResponsibilitySelection } from "../../ResponsibilityModal";

interface DeptRef {
  id: string;
  name: string;
  isDeputy: boolean;
}

interface HolderUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

interface Holder {
  roleId: string;
  user: HolderUser;
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
  readonly role: Role;
  readonly label: string;
  readonly description: string;
  readonly canManage: boolean;
  readonly holders: Holder[];
  readonly addableUsers: { id: string; name: string }[];
  readonly ministries: Ministry[];
}

function Avatar({ user, size = 32 }: { readonly user: HolderUser; readonly size?: number }) {
  if (user.image) {
    return <Image src={user.image} alt={user.name} width={size} height={size} className="rounded-full shrink-0" />;
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-brand-soft flex items-center justify-center text-xs font-semibold text-brand-text shrink-0"
    >
      {user.name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function RoleHoldersClient({ churchId, role, label, description, canManage, holders: initialHolders, addableUsers, ministries }: Props) {
  const router = useRouter();
  const [holders, setHolders] = useState<Holder[]>(initialHolders);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [addUserId, setAddUserId] = useState("");
  const [modal, setModal] = useState<{ targetId?: string; targetLabel?: string } | null>(null);
  const [confirmDialog, ask] = useConfirm();

  const isStructured = role === "MINISTER" || role === "DEPARTMENT_HEAD";

  async function removeHolder(roleId: string, userId: string, confirmed = false) {
    if (
      !confirmed &&
      !(await ask({ title: `Retirer le rôle ${label} ?`, message: "La personne perd aussitôt les droits liés à ce rôle.", confirmLabel: "Retirer le rôle" }))
    ) {
      return;
    }
    setLoading(roleId);
    try {
      const res = await fetch(`/api/users/${userId}/roles`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ churchId, role }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
      setHolders((prev) => prev.filter((h) => h.roleId !== roleId));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(null);
    }
  }

  async function removeDeptAssignment(holder: Holder, deptId: string) {
    const remaining = holder.departments.filter((d) => d.id !== deptId);
    if (!(await ask({ title: "Retirer cette responsabilité ?", message: "La personne n'est plus responsable de ce département.", confirmLabel: "Retirer la responsabilité" }))) return;
    setLoading(holder.roleId);
    try {
      if (remaining.length === 0) {
        await removeHolder(holder.roleId, holder.user.id, true);
        return;
      }
      const res = await fetch(`/api/users/${holder.user.id}/roles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: holder.roleId, departments: remaining.map((d) => ({ id: d.id, isDeputy: d.isDeputy })) }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
      setHolders((prev) => prev.map((h) => (h.roleId === holder.roleId ? { ...h, departments: remaining } : h)));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(null);
    }
  }

  async function addSimpleHolder() {
    if (!addUserId) return;
    setLoading("add");
    try {
      const res = await fetch(`/api/users/${addUserId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ churchId, role }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
      const data = await res.json();
      const user = addableUsers.find((u) => u.id === addUserId)!;
      setHolders((prev) => [
        ...prev,
        { roleId: data.id, user: { id: user.id, name: user.name, email: "", image: null }, ministryId: null, ministryName: null, departments: [] },
      ]);
      setAddUserId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(null);
    }
  }

  /** Ministre : change le ministère du titulaire existant, sinon lui attribue le rôle. */
  async function submitMinister(selection: ResponsibilitySelection) {
    const ministry = ministries.find((m) => m.id === selection.targetId);
    const existingForUser = holders.find((h) => h.user.id === selection.userId);
    if (existingForUser) {
      const res = await fetch(`/api/users/${selection.userId}/roles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: existingForUser.roleId, ministryId: selection.targetId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
      setHolders((prev) =>
        prev.map((h) =>
          h.roleId === existingForUser.roleId ? { ...h, ministryId: selection.targetId, ministryName: ministry?.name ?? null } : h
        )
      );
    } else {
      const res = await fetch(`/api/users/${selection.userId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ churchId, role: "MINISTER", ministryId: selection.targetId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
      const data = await res.json();
      const user = addableUsers.find((u) => u.id === selection.userId);
      setHolders((prev) => [
        ...prev,
        {
          roleId: data.id,
          user: { id: selection.userId, name: user?.name ?? "", email: "", image: null },
          ministryId: selection.targetId,
          ministryName: ministry?.name ?? null,
          departments: [],
        },
      ]);
    }
  }

  /** Resp. département : ajoute le département au titulaire existant, sinon lui attribue le rôle. */
  async function submitDepartmentHead(selection: ResponsibilitySelection) {
    const dept = ministries.flatMap((m) => m.departments).find((d) => d.id === selection.targetId);
    const existingForUser = holders.find((h) => h.user.id === selection.userId);
    const newEntry = { id: selection.targetId, isDeputy: selection.isDeputy };
    if (existingForUser) {
      const merged = [
        ...existingForUser.departments.filter((d) => d.id !== selection.targetId).map((d) => ({ id: d.id, isDeputy: d.isDeputy })),
        newEntry,
      ];
      const res = await fetch(`/api/users/${selection.userId}/roles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: existingForUser.roleId, departments: merged }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
      setHolders((prev) =>
        prev.map((h) =>
          h.roleId === existingForUser.roleId
            ? { ...h, departments: merged.map((d) => ({ id: d.id, isDeputy: d.isDeputy, name: dept?.name ?? "" })) }
            : h
        )
      );
    } else {
      const res = await fetch(`/api/users/${selection.userId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ churchId, role: "DEPARTMENT_HEAD", departments: [newEntry] }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
      const data = await res.json();
      const user = addableUsers.find((u) => u.id === selection.userId);
      setHolders((prev) => [
        ...prev,
        {
          roleId: data.id,
          user: { id: selection.userId, name: user?.name ?? "", email: "", image: null },
          ministryId: null,
          ministryName: null,
          departments: [{ id: selection.targetId, isDeputy: selection.isDeputy, name: dept?.name ?? "" }],
        },
      ]);
    }
  }

  async function handleResponsibilitySubmit(selection: ResponsibilitySelection) {
    if (role === "MINISTER") {
      await submitMinister(selection);
    } else {
      await submitDepartmentHead(selection);
    }
    setModal(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/access" className={`${buttonClasses("ghost", "sm")} self-start`}>
        <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
        Revenir aux accès
      </Link>

      <PageHeader eyebrow="Accès & rôles" title={label} description={description} />

      {error && <Alert tone="danger">{error}</Alert>}

      {!isStructured && (
        <div className="flex flex-col gap-3">
          {canManage && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Select
                  label="Ajouter une personne"
                  value={addUserId}
                  onChange={(e) => setAddUserId(e.target.value)}
                  placeholder="Choisir une personne"
                  options={addableUsers.map((u) => ({ value: u.id, label: u.name }))}
                />
              </div>
              <Button
                type="button"
                onClick={addSimpleHolder}
                disabled={!addUserId || loading === "add"}
                title={!addUserId ? "Choisissez d'abord une personne" : undefined}
              >
                {loading === "add" ? "Ajout…" : "Ajouter le rôle"}
              </Button>
            </div>
          )}

          {holders.length === 0 && <EmptyState size="sm" title="Aucun détenteur" description="Personne n'a encore ce rôle dans l'église." />}

          {holders.map((h) => (
            <div key={h.roleId} className="flex min-h-16 items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card">
              <Avatar user={h.user} />
              <Link
                href={`/admin/access/users/${h.user.id}`}
                className="min-w-0 flex-1 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <p className="truncate text-[15px] font-semibold leading-[22px] text-ink">{h.user.name}</p>
                <p className="truncate text-[13px] leading-[18px] text-ink-muted">{h.user.email}</p>
              </Link>
              {canManage && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => removeHolder(h.roleId, h.user.id)}
                  disabled={loading === h.roleId}
                >
                  {loading === h.roleId ? "Retrait…" : "Retirer"}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {isStructured && role === "MINISTER" && (
        <div className="flex flex-col gap-3">
          {ministries.map((ministry) => {
            const holder = holders.find((h) => h.ministryId === ministry.id);
            return (
              <div key={ministry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold leading-[22px] text-ink">{ministry.name}</p>
                  {holder ? (
                    <Link
                      href={`/admin/access/users/${holder.user.id}`}
                      className={`${buttonClasses("ghost", "sm")} -ml-3`}
                    >
                      <Avatar user={holder.user} size={16} /> {holder.user.name}
                    </Link>
                  ) : (
                    <p className="text-[13px] leading-[18px] text-ink-muted">Aucun ministre</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  {holder && canManage && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeHolder(holder.roleId, holder.user.id)}>
                      Retirer
                    </Button>
                  )}
                  {canManage && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setModal({ targetId: ministry.id, targetLabel: ministry.name })}
                    >
                      {holder ? "Changer de ministre" : "Assigner un ministre"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {ministries.length === 0 && <EmptyState size="sm" title="Aucun ministère dans votre périmètre" />}
        </div>
      )}

      {isStructured && role === "DEPARTMENT_HEAD" && (
        <div className="flex flex-col gap-6">
          {ministries.map((ministry) => (
            <section key={ministry.id} className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
              <h3 className="border-b border-line px-4 py-3 font-display text-[15px] font-semibold leading-5 text-ink">{ministry.name}</h3>
              <div className="divide-y divide-line">
                {ministry.departments.map((dept) => {
                  const deptHolders = holders.filter((h) => h.departments.some((d) => d.id === dept.id));
                  return (
                    <div key={dept.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
                      <p className="w-44 shrink-0 pt-2.5 text-[15px] leading-[22px] text-ink-muted">{dept.name}</p>
                      <div className="flex flex-1 flex-wrap items-center gap-2">
                        {deptHolders.map((h) => {
                          const dep = h.departments.find((d) => d.id === dept.id)?.isDeputy ?? false;
                          return (
                            <span key={h.roleId} className="inline-flex items-center gap-1">
                              <Link
                                href={`/admin/access/users/${h.user.id}`}
                                className={buttonClasses("secondary", "sm")}
                              >
                                <Avatar user={h.user} size={16} />
                                {h.user.name}
                                {dep && <StatusChip>Adjoint</StatusChip>}
                              </Link>
                              {canManage && (
                                <IconButton
                                  icon={X}
                                  aria-label={`Retirer ${h.user.name} de ${dept.name}`}
                                  onClick={() => removeDeptAssignment(h, dept.id)}
                                />
                              )}
                            </span>
                          );
                        })}
                        {deptHolders.length === 0 && <span className="text-[13px] leading-[18px] text-ink-muted">Aucun responsable</span>}
                        {canManage && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setModal({ targetId: dept.id, targetLabel: `${ministry.name} / ${dept.name}` })}
                          >
                            <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
                            Ajouter un responsable
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {ministries.length === 0 && <EmptyState size="sm" title="Aucun département dans votre périmètre" />}
        </div>
      )}

      {modal && (
        <ResponsibilityModal
          open
          onClose={() => setModal(null)}
          title={role === "MINISTER" ? "Assigner un ministre" : "Ajouter un responsable"}
          subtitle={modal.targetLabel}
          mode={role === "MINISTER" ? "minister" : "department-head"}
          userOptions={addableUsers.map((u) => ({ value: u.id, label: u.name }))}
          fixedTargetId={modal.targetId}
          fixedTargetLabel={modal.targetLabel}
          onSubmit={handleResponsibilitySubmit}
          submitLabel={role === "MINISTER" ? "Assigner le ministre" : "Ajouter le responsable"}
        />
      )}
      {confirmDialog}
    </div>
  );
}
