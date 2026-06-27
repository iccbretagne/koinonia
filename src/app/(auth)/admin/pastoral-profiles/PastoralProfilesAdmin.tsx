"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

interface User { id: string; name: string | null; displayName: string | null; email: string | null }
interface Profile {
  id: string;
  name: string;
  role: string;
  email: string | null;
  user: User | null;
}

interface Props { churchId: string; profiles: Profile[]; users: User[] }

const ROLES = [
  { value: "PASTEUR", label: "Pasteur" },
  { value: "ASSISTANT_PASTEUR", label: "Assistante Pasteur" },
  { value: "BERGER", label: "Berger" },
];

const EMPTY_FORM = { name: "", role: "PASTEUR", email: "", userId: "" };

export default function PastoralProfilesAdmin({ churchId, profiles: initial, users }: Props) {
  const [profiles, setProfiles] = useState(initial);
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
    if (!form.name || !form.role) { alert("Le nom et le rôle sont requis."); return; }
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
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      const saved = await res.json();

      if (editId) {
        setProfiles((prev) => prev.map((p) => (p.id === editId ? { ...p, ...saved.data, user: users.find((u) => u.id === form.userId) ?? null } : p)));
      } else {
        const newProfile = { ...saved.data, user: users.find((u) => u.id === form.userId) ?? null };
        setProfiles((prev) => [...prev, newProfile]);
      }
      cancelEdit();
    } catch { alert("Erreur réseau"); }
    finally { setSubmitting(false); }
  }

  async function del(id: string) {
    if (!confirm("Supprimer ce profil pastoral ?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/agenda/profiles/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    } catch { alert("Erreur réseau"); }
    finally { setDeleting(null); }
  }

  const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;

  return (
    <div className="space-y-6">
      {/* Formulaire */}
      <div className="bg-white rounded-lg shadow border border-gray-100 p-5">
        <h2 className="font-semibold text-gray-900 mb-4">{editId ? "Modifier le profil" : "Nouveau profil"}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nom <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Prénom Nom"
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Rôle <span className="text-red-500">*</span></label>
            <select
              value={form.role}
              onChange={(e) => set("role", e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
            >
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Compte utilisateur (optionnel)</label>
            <select
              value={form.userId}
              onChange={(e) => set("userId", e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
            >
              <option value="">— Aucun —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.displayName ?? u.name ?? u.email}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={submitting}>
            {submitting ? "Enregistrement..." : editId ? "Mettre à jour" : "Créer le profil"}
          </Button>
          {editId && <Button size="sm" variant="secondary" onClick={cancelEdit}>Annuler</Button>}
        </div>
      </div>

      {/* Liste */}
      {profiles.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6">Aucun profil pastoral configuré.</p>
      ) : (
        <div className="bg-white rounded-lg shadow border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Nom</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Rôle</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Compte lié</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {profiles.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-gray-600">{roleLabel(p.role)}</td>
                  <td className="px-4 py-3 text-gray-600">{p.email ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{p.user?.displayName ?? p.user?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(p)}>Modifier</Button>
                      <Button size="sm" variant="danger" onClick={() => del(p.id)} disabled={deleting === p.id}>
                        Supprimer
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
    </div>
  );
}
