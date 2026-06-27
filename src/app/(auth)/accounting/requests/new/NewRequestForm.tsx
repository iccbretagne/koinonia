"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AttachmentManager, { type AttachmentItem } from "@/app/(auth)/accounting/components/AttachmentManager";

interface Department {
  id: string;
  name: string;
  ministry: { name: string };
}

interface Props {
  departments: Department[];
}

type RequestMode = "one_shot" | "recurring";

export default function NewRequestForm({ departments }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<RequestMode>("one_shot");
  const [type, setType] = useState<"EXPENSE_REPORT" | "BUDGET_ADVANCE">("EXPENSE_REPORT");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);

  const [form, setForm] = useState({
    departmentId: departments[0]?.id ?? "",
    label:        "",
    description:  "",
    amount:       "",
  });
  const [recurrence, setRecurrence] = useState({
    every:     "1",
    unit:      "MONTH" as "WEEK" | "MONTH",
    firstDate: "",
  });

  // Pour les avances récurrentes (série), un département est obligatoire
  const isRecurringMode = mode === "recurring";

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const amount = parseFloat(form.amount);
      if (isNaN(amount) || amount <= 0) { setError("Montant invalide"); setLoading(false); return; }

      let res: Response;
      if (mode === "recurring") {
        res = await fetch("/api/accounting/series", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            departmentId:        form.departmentId,
            label:               form.label,
            description:         form.description || undefined,
            amount,
            recurrenceEvery:     parseInt(recurrence.every),
            recurrenceUnit:      recurrence.unit,
            firstOccurrenceDate: new Date(recurrence.firstDate).toISOString(),
          }),
        });
      } else {
        res = await fetch("/api/accounting/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            departmentId:  form.departmentId || undefined, // undefined = personnel sans département
            label:         form.label,
            description:   form.description || undefined,
            amount,
            attachmentIds: attachments.map((a) => a.id),
          }),
        });
      }

      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erreur"); return; }
      router.push("/accounting/requests");
      router.refresh();
    } catch { setError("Erreur réseau"); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
      <h1 className="text-lg font-bold text-gray-900">Nouvelle demande financière</h1>

      {/* Mode */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Type de demande</label>
        <div className="flex flex-wrap gap-2">
          {[
            { value: "one_shot",  label: "Note de frais",     desc: "Dépense déjà effectuée" },
            { value: "one_shot",  label: "Avance one-shot",   desc: "Dépense à venir, ponctuelle", type: "BUDGET_ADVANCE" as const },
            { value: "recurring", label: "Avance récurrente", desc: "Virement régulier planifié" },
          ].map((opt, i) => {
            const isActive = mode === opt.value && (opt.type ? type === opt.type : type === "EXPENSE_REPORT" || opt.value === "recurring");
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setMode(opt.value as RequestMode);
                  if (opt.type) setType(opt.type);
                  else if (opt.value === "one_shot") setType("EXPENSE_REPORT");
                }}
                className={`flex-1 min-w-[140px] text-left px-4 py-3 rounded-xl border-2 transition-colors ${
                  isActive ? "border-icc-violet bg-icc-violet/5" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <p className={`text-sm font-medium ${isActive ? "text-icc-violet" : "text-gray-800"}`}>{opt.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Département */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          Département
          {!isRecurringMode && <span className="text-gray-400 font-normal ml-1">(facultatif pour les notes de frais personnelles)</span>}
        </label>
        <select
          value={form.departmentId}
          onChange={(e) => set("departmentId", e.target.value)}
          required={isRecurringMode}
          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-icc-violet"
        >
          {!isRecurringMode && (
            <option value="">— Personnel (sans département)</option>
          )}
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.ministry.name} — {d.name}</option>
          ))}
        </select>
      </div>

      {/* Intitulé */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Intitulé</label>
        <input
          type="text"
          value={form.label}
          onChange={(e) => set("label", e.target.value)}
          required
          maxLength={200}
          placeholder="ex : Achat matériel son — culte du 15 juin"
          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-icc-violet"
        />
      </div>

      {/* Montant */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Montant TTC (€)</label>
        <input
          type="number"
          value={form.amount}
          onChange={(e) => set("amount", e.target.value)}
          required
          min={0.01}
          step={0.01}
          placeholder="0,00"
          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-icc-violet"
        />
      </div>

      {/* Récurrence */}
      {mode === "recurring" && (
        <div className="space-y-3 bg-purple-50 border border-purple-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Paramètres de récurrence</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-700">Tous les</span>
            <input
              type="number"
              value={recurrence.every}
              onChange={(e) => setRecurrence((r) => ({ ...r, every: e.target.value }))}
              min={1} max={99}
              className="w-16 border-2 border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:border-purple-400"
            />
            <select
              value={recurrence.unit}
              onChange={(e) => setRecurrence((r) => ({ ...r, unit: e.target.value as "WEEK" | "MONTH" }))}
              className="border-2 border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-purple-400"
            >
              <option value="WEEK">semaine(s)</option>
              <option value="MONTH">mois</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600">Date de la première occurrence</label>
            <input
              type="date"
              value={recurrence.firstDate}
              onChange={(e) => setRecurrence((r) => ({ ...r, firstDate: e.target.value }))}
              required={mode === "recurring"}
              className="border-2 border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-400"
            />
          </div>
        </div>
      )}

      {/* Description */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          Description <span className="text-gray-400 font-normal">(facultatif)</span>
        </label>
        <textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          placeholder="Détail de la dépense, contexte, références devis…"
          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet resize-none"
        />
      </div>

      {/* Pièces jointes */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Pièces jointes <span className="text-gray-400 font-normal">(reçu, facture, devis…)</span>
        </label>
        <AttachmentManager
          attachments={attachments}
          canUpload
          canDelete
          onChange={setAttachments}
        />
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex gap-3 justify-end pt-1">
        <Link href="/accounting/requests" className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</Link>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 bg-icc-violet text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? "Envoi…" : "Soumettre la demande"}
        </button>
      </div>
    </form>
  );
}
