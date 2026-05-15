"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

interface Profile { id: string; name: string; role: string }
interface Props { churchId: string; profiles: Profile[] }

const ROLE_LABELS: Record<string, string> = {
  PASTEUR: "Pasteur",
  ASSISTANT_PASTEUR: "Assistante Pasteur",
  BERGER: "Berger",
};

export default function NewEntryForm({ churchId, profiles }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    type: "ACTIVITY" as "ACTIVITY" | "APPOINTMENT",
    recipientId: profiles[0]?.id ?? "",
    title: "",
    description: "",
    startsAt: "",
    endsAt: "",
    location: "",
  });

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.recipientId || !form.title || !form.startsAt) {
      alert("Profil, titre et date de début sont requis.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/agenda/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchId,
          recipientId: form.recipientId,
          type: form.type,
          title: form.title,
          description: form.description || null,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
          location: form.location || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      router.push("/agenda");
      router.refresh();
    } catch { alert("Erreur réseau"); }
    finally { setSubmitting(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-5 bg-white rounded-lg shadow border border-gray-100 p-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
        <div className="flex gap-4">
          {(["ACTIVITY", "APPOINTMENT"] as const).map((t) => (
            <label key={t} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="type"
                value={t}
                checked={form.type === t}
                onChange={() => set("type", t)}
              />
              <span className="text-sm">{t === "ACTIVITY" ? "Activité" : "Rendez-vous"}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Profil pastoral <span className="text-red-500">*</span>
        </label>
        <select
          value={form.recipientId}
          onChange={(e) => set("recipientId", e.target.value)}
          required
          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name} — {ROLE_LABELS[p.role] ?? p.role}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Titre <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          required
          placeholder="Culte, réunion d'équipe, RDV avec..."
          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Début <span className="text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => set("startsAt", e.target.value)}
            required
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fin</label>
          <input
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => set("endsAt", e.target.value)}
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Lieu</label>
        <input
          type="text"
          value={form.location}
          onChange={(e) => set("location", e.target.value)}
          placeholder="Salle, adresse..."
          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet resize-none"
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Enregistrement..." : "Enregistrer"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
