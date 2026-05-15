"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

interface Props {
  churchId: string;
  defaultFirstName: string;
  defaultLastName: string;
  defaultEmail: string;
}

const DAYS_OPTIONS = [
  { value: "LUNDI", label: "Lundi" },
  { value: "MARDI", label: "Mardi" },
  { value: "MERCREDI", label: "Mercredi" },
  { value: "JEUDI", label: "Jeudi" },
  { value: "VENDREDI", label: "Vendredi" },
  { value: "SAMEDI", label: "Samedi" },
  { value: "DIMANCHE", label: "Dimanche" },
];

export default function RequestForm({ churchId, defaultFirstName, defaultLastName, defaultEmail }: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    firstName: defaultFirstName,
    lastName: defaultLastName,
    email: defaultEmail,
    phone: "",
    subject: "",
    message: "",
    preferredDays: [] as string[],
  });

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleDay(day: string) {
    setForm((prev) => ({
      ...prev,
      preferredDays: prev.preferredDays.includes(day)
        ? prev.preferredDays.filter((d) => d !== day)
        : [...prev.preferredDays, day],
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subject || !form.message) { alert("L'objet et le message sont requis."); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/agenda/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchId,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email || null,
          phone: form.phone || null,
          subject: form.subject,
          message: form.message,
          preferredDays: form.preferredDays.length > 0 ? form.preferredDays.join(",") : null,
        }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      setSubmitted(true);
    } catch { alert("Erreur réseau"); }
    finally { setSubmitting(false); }
  }

  if (submitted) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
        <p className="text-green-800 font-semibold text-lg mb-2">Demande envoyée !</p>
        <p className="text-green-700 text-sm">
          Votre demande a bien été reçue. Un qualificateur la traitera prochainement et vous sera assigné un créneau.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5 bg-white rounded-lg shadow border border-gray-100 p-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
          <input
            type="text"
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            required
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
          <input
            type="text"
            value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            required
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Objet de la demande <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.subject}
          onChange={(e) => set("subject", e.target.value)}
          required
          placeholder="Croissance spirituelle, conseil, prière..."
          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Message <span className="text-red-500">*</span>
        </label>
        <textarea
          value={form.message}
          onChange={(e) => set("message", e.target.value)}
          required
          rows={4}
          placeholder="Décrivez votre demande..."
          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Disponibilités souhaitées
        </label>
        <div className="flex flex-wrap gap-2">
          {DAYS_OPTIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => toggleDay(d.value)}
              className={`px-3 py-1 rounded-full text-sm border-2 transition-colors ${
                form.preferredDays.includes(d.value)
                  ? "bg-icc-violet text-white border-icc-violet"
                  : "border-gray-200 text-gray-700 hover:border-icc-violet"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting ? "Envoi en cours..." : "Envoyer ma demande"}
      </Button>
    </form>
  );
}
