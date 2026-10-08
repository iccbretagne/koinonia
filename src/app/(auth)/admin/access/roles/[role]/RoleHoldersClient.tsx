"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Role } from "@/generated/prisma/client";
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
      className="rounded-full bg-surface-sunken flex items-center justify-center text-xs font-semibold text-ink-muted shrink-0"
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

  const isStructured = role === "MINISTER" || role === "DEPARTMENT_HEAD";

  async function removeHolder(roleId: string, userId: string) {
    if (!confirm(`Retirer ce rôle ?`)) return;
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
    if (!confirm("Retirer cette responsabilité ?")) return;
    setLoading(holder.roleId);
    try {
      if (remaining.length === 0) {
        await removeHolder(holder.roleId, holder.user.id);
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
    <div className="space-y-6">
      <Link href="/admin/access" className="text-sm text-brand-text hover:underline">← Retour</Link>

      <div>
        <h1 className="text-lg font-semibold text-ink">{label}</h1>
        <p className="text-sm text-ink-muted mt-1">{description}</p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {!isStructured && (
        <div className="space-y-3">
          {canManage && (
            <div className="flex gap-2">
              <select
                value={addUserId}
                onChange={(e) => setAddUserId(e.target.value)}
                className="flex-1 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
              >
                <option value="">-- Ajouter une personne --</option>
                {addableUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <button
                onClick={addSimpleHolder}
                disabled={!addUserId || loading === "add"}
                className="px-4 py-2 text-sm rounded-lg bg-brand text-on-brand hover:bg-brand-hover disabled:opacity-50"
              >
                {loading === "add" ? "…" : "Ajouter"}
              </button>
            </div>
          )}

          {holders.length === 0 && <p className="text-sm text-ink-subtle italic text-center py-8">Aucun détenteur.</p>}

          {holders.map((h) => (
            <div key={h.roleId} className="flex items-center gap-3 bg-surface rounded-lg border border-line shadow-card px-4 py-3">
              <Avatar user={h.user} />
              <Link href={`/admin/access/users/${h.user.id}`} className="flex-1 min-w-0 hover:underline">
                <p className="text-sm font-medium text-ink truncate">{h.user.name}</p>
                <p className="text-xs text-ink-subtle truncate">{h.user.email}</p>
              </Link>
              {canManage && (
                <button
                  onClick={() => removeHolder(h.roleId, h.user.id)}
                  disabled={loading === h.roleId}
                  className="text-xs px-3 py-1.5 rounded-md font-medium border border-danger/30 text-danger hover:bg-danger-soft disabled:opacity-50 shrink-0"
                >
                  {loading === h.roleId ? "…" : "Retirer"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isStructured && role === "MINISTER" && (
        <div className="space-y-3">
          {ministries.map((ministry) => {
            const holder = holders.find((h) => h.ministryId === ministry.id);
            return (
              <div key={ministry.id} className="bg-surface rounded-lg border border-line shadow-card px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-ink-muted">{ministry.name}</p>
                  {holder ? (
                    <Link href={`/admin/access/users/${holder.user.id}`} className="inline-flex items-center gap-1.5 text-xs text-brand-text hover:underline mt-1">
                      <Avatar user={holder.user} size={14} /> {holder.user.name}
                    </Link>
                  ) : (
                    <span className="text-xs text-ink-subtle italic">Aucun</span>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {holder && canManage && (
                    <button
                      onClick={() => removeHolder(holder.roleId, holder.user.id)}
                      className="text-xs px-2.5 py-1 rounded-md font-medium border border-danger/30 text-danger hover:bg-danger-soft"
                    >
                      Retirer
                    </button>
                  )}
                  {canManage && (
                    <button
                      onClick={() => setModal({ targetId: ministry.id, targetLabel: ministry.name })}
                      className="text-xs px-2.5 py-1 rounded-md font-medium bg-brand text-on-brand hover:bg-brand-hover"
                    >
                      {holder ? "Changer" : "Assigner"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {ministries.length === 0 && <p className="text-sm text-ink-subtle italic text-center py-8">Aucun ministère dans votre périmètre.</p>}
        </div>
      )}

      {isStructured && role === "DEPARTMENT_HEAD" && (
        <div className="space-y-6">
          {ministries.map((ministry) => (
            <div key={ministry.id} className="bg-surface rounded-xl border border-line shadow-card overflow-hidden">
              <div className="px-5 py-2.5 bg-surface-sunken border-b border-line">
                <h3 className="text-sm font-semibold text-ink-muted">{ministry.name}</h3>
              </div>
              <div className="divide-y divide-line">
                {ministry.departments.map((dept) => {
                  const deptHolders = holders.filter((h) => h.departments.some((d) => d.id === dept.id));
                  return (
                    <div key={dept.id} className="px-5 py-3 flex items-start gap-4 flex-wrap">
                      <p className="text-sm text-ink-muted w-44 shrink-0 pt-1">{dept.name}</p>
                      <div className="flex flex-wrap gap-2 flex-1 items-center">
                        {deptHolders.map((h) => {
                          const dep = h.departments.find((d) => d.id === dept.id)?.isDeputy ?? false;
                          return (
                            <span
                              key={h.roleId}
                              className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium border ${
                                dep ? "bg-surface-sunken text-ink-muted border-line" : "bg-brand text-on-brand border-brand"
                              }`}
                            >
                              <Avatar user={h.user} size={14} />
                              <Link href={`/admin/access/users/${h.user.id}`} className="hover:underline">{h.user.name}</Link>
                              {dep && <span className="opacity-60 font-normal">· adj.</span>}
                              {canManage && (
                                <button
                                  onClick={() => removeDeptAssignment(h, dept.id)}
                                  className="ml-0.5 opacity-60 hover:opacity-100 hover:text-danger"
                                  title="Retirer"
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          );
                        })}
                        {deptHolders.length === 0 && <span className="text-xs text-ink-subtle italic">Aucun responsable</span>}
                        {canManage && (
                          <button
                            onClick={() => setModal({ targetId: dept.id, targetLabel: `${ministry.name} / ${dept.name}` })}
                            className="text-xs px-2.5 py-1 rounded-md font-medium border border-line text-ink-muted hover:bg-surface-sunken"
                          >
                            + Ajouter
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {ministries.length === 0 && <p className="text-sm text-ink-subtle italic text-center py-8">Aucun département dans votre périmètre.</p>}
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
          submitLabel={role === "MINISTER" ? "Assigner" : "Ajouter"}
        />
      )}
    </div>
  );
}
