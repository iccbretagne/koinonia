"use client";

import { useState } from "react";
import { Button, EmptyState, Input, Select, useToast } from "@/components/ui";
import { useConfirm } from "../use-confirm";

interface User { id: string; name: string | null; displayName: string | null; email: string | null }
interface Profile {
  id: string;
  name: string;
  role: string;
  email: string | null;
  user: User | null;
}

interface Props { readonly churchId: string; readonly profiles: Profile[]; readonly users: User[] }

const ROLES = [
  { value: "PASTEUR", label: "Pasteur" },
  { value: "ASSISTANT_PASTEUR", label: "Assistante Pasteur" },
  { value: "BERGER", label: "Berger" },
];

const EMPTY_FORM = { name: "", role: "PASTEUR", email: "", userId: "" };

export default function PastoralProfilesAdmin({ churchId, profiles: initial, users }: Props) {
  const [profiles, setProfiles] = useState(initial);
  const [confirmDialog, ask] = useConfirm();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function startEdit(p: Profile) {
    setEditId(p.id);
    setForm({ name: p.name, role: p.role, email: p.email ?? "", userId: p.user?.id ?? "" });
  }

  function cancelEdit() {
    setEditId(null);
    setForm(EMPTY_FORM);
  }

  async function save() {
    if (!form.name || !form.role) { toast.error("Le nom et le rôle sont requis."); return; }
    setSubmitting(true);
    try {
      const url = editId ? `/api/agenda/profiles/${editId}` : "/api/agenda/profiles";
      const method = editId ? "PATCH" : "POST";
      const body = editId
        ? { name: form.name, role: form.role, email: form.email || null, userId: form.userId || null }
        : { churchId, name: form.name, role: form.role, email: form.email || null, userId: form.userId || null };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || "Erreur"); return; }
      const saved = await res.json();

      if (editId) {
        setProfiles((prev) => prev.map((p) => (p.id === editId ? { ...p, ...saved.data, user: users.find((u) => u.id === form.userId) ?? null } : p)));
      } else {
        const newProfile = { ...saved.data, user: users.find((u) => u.id === form.userId) ?? null };
        setProfiles((prev) => [...prev, newProfile]);
      }
      cancelEdit();
    } catch { toast.error("Erreur réseau"); }
    finally { setSubmitting(false); }
  }

  async function del(id: string) {
    const ok = await ask({
      title: "Supprimer ce profil pastoral ?",
      message: "Le profil ne pourra plus être choisi dans l'agenda pastoral.",
      confirmLabel: "Supprimer le profil",
    });
    if (!ok) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/agenda/profiles/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || "Erreur"); return; }
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    } catch { toast.error("Erreur réseau"); }
    finally { setDeleting(null); }
  }

  const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;

  let saveLabel = "Créer le profil";
  if (submitting) saveLabel = "Enregistrement…";
  else if (editId) saveLabel = "Enregistrer le profil";

  return (
    <div className="flex flex-col gap-6">
      {/* Formulaire */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="mb-4 font-display text-[17px] font-semibold leading-6 text-ink">
          {editId ? "Modifier le profil" : "Créer un profil"}
        </h2>
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Nom"
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Prénom Nom"
          />
          <Select
            label="Rôle"
            value={form.role}
            onChange={(e) => set("role", e.target.value)}
            options={ROLES}
          />
          <Input
            label="Email (facultatif)"
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
          <Select
            label="Compte utilisateur (facultatif)"
            value={form.userId}
            onChange={(e) => set("userId", e.target.value)}
            options={[
              { value: "", label: "Aucun compte" },
              ...users.map((u) => ({ value: u.id, label: u.displayName ?? u.name ?? u.email ?? u.id })),
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={submitting}>
            {saveLabel}
          </Button>
          {editId && <Button variant="secondary" onClick={cancelEdit}>Annuler</Button>}
        </div>
      </div>

      {/* Liste */}
      {profiles.length === 0 ? (
        <EmptyState size="sm" title="Aucun profil pastoral configuré" />
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface-sunken">
              <tr>
                <th className="px-4 py-3 text-left text-[13px] font-semibold text-ink-muted">Nom</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold text-ink-muted">Rôle</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold text-ink-muted">Email</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold text-ink-muted">Compte lié</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {profiles.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-semibold text-ink">{p.name}</td>
                  <td className="px-4 py-3 text-ink-muted">{roleLabel(p.role)}</td>
                  <td className="px-4 py-3 text-ink-muted">{p.email ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-muted">{p.user?.displayName ?? p.user?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(p)}>Modifier</Button>
                      <Button size="sm" variant="ghost" onClick={() => del(p.id)} disabled={deleting === p.id}>
                        {deleting === p.id ? "Suppression…" : "Supprimer"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
