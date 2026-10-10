"use client";

import { SubmitEvent, useEffect, useId, useState } from "react";
import Image from "next/image";

interface UserRef {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

interface Assignment {
  id: string;
  familyId: number;
  familyName: string;
  role: "BERGER" | "CO_BERGER";
  user: UserRef;
  createdAt: string | Date;
}

interface FamilyOption {
  id: number;
  name: string;
}

interface Props {
  readonly churchId: string;
  readonly initialAssignments: Assignment[];
  readonly users: UserRef[];
}

const ROLE_LABELS: Record<"BERGER" | "CO_BERGER", string> = {
  BERGER: "Berger",
  CO_BERGER: "Co-berger",
};

const ROLE_COLORS: Record<"BERGER" | "CO_BERGER", string> = {
  BERGER: "bg-brand-soft text-brand-text border-brand/20",
  CO_BERGER: "bg-info-soft text-info border-info/30",
};

function Avatar({ user, size = 8 }: { readonly user: UserRef; readonly size?: number }) {
  const initials = (user.name ?? user.email ?? "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const cls = `w-${size} h-${size} rounded-full flex items-center justify-center text-xs font-bold shrink-0`;
  if (user.image) {
    return <Image src={user.image} alt={user.name ?? ""} width={size * 4} height={size * 4} className={`${cls} object-cover`} />;
  }
  return <div className={`${cls} bg-brand-soft text-brand-text`}>{initials}</div>;
}

export default function LeadersDashboard({ churchId, initialAssignments, users }: Props) {
  const uid = useId();
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments);
  const [showForm, setShowForm] = useState(false);
  const [families, setFamilies] = useState<FamilyOption[]>([]);
  const [familiesLoading, setFamiliesLoading] = useState(false);
  const [form, setForm] = useState({ userId: "", familyId: "", role: "BERGER" as "BERGER" | "CO_BERGER" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!showForm || families.length > 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des données au montage et au changement de dépendance
    setFamiliesLoading(true);
    fetch(`/api/integration/families?churchId=${encodeURIComponent(churchId)}`)
      .then((r) => r.json())
      .then((j) => setFamilies(j.families ?? []))
      .catch(() => setFamilies([]))
      .finally(() => setFamiliesLoading(false));
  }, [showForm, churchId, families.length]);

  // Group assignments by family
  const byFamily = assignments.reduce<Record<number, { name: string; items: Assignment[] }>>((acc, a) => {
    if (!acc[a.familyId]) acc[a.familyId] = { name: a.familyName, items: [] };
    acc[a.familyId].items.push(a);
    return acc;
  }, {});
  const familyGroups = Object.entries(byFamily).sort(([, a], [, b]) => a.name.localeCompare(b.name, "fr"));

  const selectedFamily = families.find((f) => String(f.id) === form.familyId);

  async function handleAdd(e: SubmitEvent) {
    e.preventDefault();
    if (!form.userId || !form.familyId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/integration/leaders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchId,
          userId: form.userId,
          familyId: Number.parseInt(form.familyId),
          familyName: selectedFamily?.name ?? "",
          role: form.role,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erreur lors de l'ajout"); return; }
      setAssignments((prev) => [...prev, json]);
      setForm({ userId: "", familyId: "", role: "BERGER" });
      setShowForm(false);
    } catch {
      setError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/integration/leaders/${id}`, { method: "DELETE" });
      if (res.ok) setAssignments((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  const inputCls = "w-full border border-control-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:border-brand";

  return (
    <div className="space-y-6">
      {/* Header action */}
      <div className="flex justify-end">
        <button
          onClick={() => { setShowForm(true); setError(null); }}
          className="flex items-center gap-2 bg-brand text-on-brand px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Affecter un berger
        </button>
      </div>

      {/* Formulaire d'ajout */}
      {showForm && (
        <div className="bg-surface border border-brand/20 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">Nouvelle affectation</h2>
            <button onClick={() => setShowForm(false)} className="text-ink-subtle hover:text-ink-muted">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <label htmlFor={`${uid}-user`} className="block text-sm font-medium text-ink-muted mb-1">
                Utilisateur <span className="text-danger">*</span>
              </label>
              <select
                id={`${uid}-user`}
                required
                value={form.userId}
                onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                className={inputCls}
              >
                <option value="">Choisir un utilisateur…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.email}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor={`${uid}-family`} className="block text-sm font-medium text-ink-muted mb-1">
                Famille <span className="text-danger">*</span>
              </label>
              {familiesLoading ? (
                <p className="text-sm text-ink-subtle">Chargement…</p>
              ) : (
                <select
                  id={`${uid}-family`}
                  required
                  value={form.familyId}
                  onChange={(e) => setForm((f) => ({ ...f, familyId: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">Choisir une famille…</option>
                  {families.map((fam) => (
                    <option key={fam.id} value={fam.id}>
                      {fam.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <fieldset className="min-w-0">
              <legend className="block text-sm font-medium text-ink-muted mb-1">Rôle</legend>
              <div className="flex gap-2">
                {(["BERGER", "CO_BERGER"] as const).map((r) => (
                  <label
                    key={r}
                    className={`flex items-center gap-2 px-3 py-2 rounded-full border text-sm cursor-pointer transition-colors ${
                      form.role === r
                        ? "bg-brand text-on-brand border-brand"
                        : "border-line text-ink-muted hover:border-brand"
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r}
                      checked={form.role === r}
                      onChange={() => setForm((f) => ({ ...f, role: r }))}
                      className="sr-only"
                    />
                    {ROLE_LABELS[r]}
                  </label>
                ))}
              </div>
            </fieldset>

            {error && <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg text-sm border border-line text-ink-muted hover:bg-surface-sunken"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm bg-brand text-on-brand font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Enregistrement…" : "Affecter"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste par famille */}
      {familyGroups.length === 0 ? (
        <div className="bg-surface rounded-xl border border-line p-8 text-center text-sm text-ink-subtle">
          Aucune affectation configurée. Commencez par affecter un berger à une famille.
        </div>
      ) : (
        <div className="space-y-4">
          {familyGroups.map(([familyId, group]) => (
            <div key={familyId} className="bg-surface rounded-xl border border-line overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3 border-b border-line bg-surface-sunken/50">
                <svg className="w-4 h-4 text-brand-text shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="font-semibold text-ink text-sm">{group.name}</span>
                <span className="text-xs text-ink-subtle ml-auto">{group.items.length} responsable{group.items.length > 1 ? "s" : ""}</span>
              </div>

              <ul className="divide-y divide-line">
                {group.items.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                    <Avatar user={a.user} size={8} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{a.user.name ?? a.user.email}</p>
                      <p className="text-xs text-ink-subtle truncate">{a.user.email}</p>
                    </div>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${ROLE_COLORS[a.role]}`}>
                      {ROLE_LABELS[a.role]}
                    </span>
                    <button
                      onClick={() => handleDelete(a.id)}
                      disabled={deletingId === a.id}
                      className="shrink-0 p-1.5 rounded-lg text-ink-subtle hover:text-danger hover:bg-danger-soft transition-colors disabled:opacity-40"
                      title="Retirer"
                    >
                      {deletingId === a.id ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
