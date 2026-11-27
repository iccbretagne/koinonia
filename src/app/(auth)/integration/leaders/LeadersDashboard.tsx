"use client";

import { Loader2, Plus, Trash2, Users, X } from "lucide-react";
import { SubmitEvent, useEffect, useId, useState } from "react";
import Image from "next/image";
import { Alert, Button, EmptyState, IconButton, Select, StatusChip, fieldLabelClasses, type StatusTone } from "@/components/ui";

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

const ROLE_TONES: Record<"BERGER" | "CO_BERGER", StatusTone> = {
  BERGER: "brand",
  CO_BERGER: "info",
};

function Avatar({ user }: { readonly user: UserRef }) {
  const initials = (user.name ?? user.email ?? "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const cls = "size-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0";
  if (user.image) {
    return <Image src={user.image} alt={user.name ?? ""} width={32} height={32} className={`${cls} object-cover`} />;
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

  return (
    <div className="flex flex-col gap-6">
      {/* Header action */}
      {!showForm && (
        <div className="flex justify-end">
          <Button type="button" onClick={() => { setShowForm(true); setError(null); }}>
            <Plus className="size-4" aria-hidden="true" strokeWidth={1.75} />
            Affecter un berger
          </Button>
        </div>
      )}

      {/* Formulaire d'ajout */}
      {showForm && (
        <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-[17px] font-semibold text-ink">Nouvelle affectation</h2>
            <IconButton icon={X} aria-label="Fermer le formulaire" onClick={() => setShowForm(false)} />
          </div>

          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <Select
              id={`${uid}-user`}
              label="Utilisateur"
              required
              value={form.userId}
              onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
              placeholder="Choisir un utilisateur…"
              options={users.map((u) => ({ value: u.id, label: u.name ?? u.email ?? u.id }))}
            />

            {familiesLoading ? (
              <p className="text-sm text-ink-muted">Chargement des familles en cours…</p>
            ) : (
              <Select
                id={`${uid}-family`}
                label="Famille"
                required
                value={form.familyId}
                onChange={(e) => setForm((f) => ({ ...f, familyId: e.target.value }))}
                placeholder="Choisir une famille…"
                options={families.map((fam) => ({ value: String(fam.id), label: fam.name }))}
              />
            )}

            <fieldset className="min-w-0">
              <legend className={`${fieldLabelClasses} mb-2`}>Rôle</legend>
              <div className="flex flex-wrap gap-2">
                {(["BERGER", "CO_BERGER"] as const).map((r) => (
                  <label
                    key={r}
                    className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
                      form.role === r
                        ? "border-brand bg-brand-soft text-brand-text"
                        : "border-control-line bg-surface text-ink-muted hover:bg-surface-sunken"
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

            {error && <Alert tone="danger">{error}</Alert>}

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end sm:gap-3">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Enregistrement en cours…" : "Affecter le berger"}
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* Liste par famille */}
      {familyGroups.length === 0 ? (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState
            size="sm"
            icon={Users}
            title="Aucune affectation configurée"
            description="Commencez par affecter un berger à une famille."
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {familyGroups.map(([familyId, group]) => (
            <section key={familyId} className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
              <div className="flex items-center gap-3 border-b border-line px-5 py-3">
                <Users className="size-4 shrink-0 text-brand-text" aria-hidden="true" strokeWidth={1.75} />
                <h2 className="text-sm font-semibold text-ink">{group.name}</h2>
                <span className="ml-auto text-xs text-ink-muted">{group.items.length} responsable{group.items.length > 1 ? "s" : ""}</span>
              </div>

              <ul className="divide-y divide-line">
                {group.items.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                    <Avatar user={a.user} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{a.user.name ?? a.user.email}</p>
                      <p className="truncate text-xs text-ink-muted">{a.user.email}</p>
                    </div>
                    <StatusChip tone={ROLE_TONES[a.role]} className="shrink-0">{ROLE_LABELS[a.role]}</StatusChip>
                    <IconButton
                      icon={deletingId === a.id ? Loader2 : Trash2}
                      aria-label={deletingId === a.id ? "Retrait en cours…" : `Retirer ${a.user.name ?? a.user.email ?? "ce responsable"} de ${group.name}`}
                      onClick={() => handleDelete(a.id)}
                      disabled={deletingId === a.id}
                      className={deletingId === a.id ? "[&_svg]:animate-spin" : ""}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
