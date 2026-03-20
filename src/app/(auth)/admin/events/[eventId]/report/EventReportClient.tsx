"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Link from "next/link";
import { useParams } from "next/navigation";

interface Dept { id: string; name: string; ministryName: string }

interface Section {
  id?: string;
  departmentId: string | null;
  label: string;
  position: number;
  present: number | null;
  absent: number | null;
  newcomers: number | null;
  notes: string | null;
  department?: { id: string; name: string; ministry: { name: string } } | null;
}

interface ExistingReport {
  id: string;
  notes: string | null;
  decisions: string | null;
  sections: Section[];
  author: { id: string; name: string | null } | null;
  updatedAt?: string | Date;
}

interface Props {
  eventId: string;
  statsEnabled: boolean;
  existingReport: ExistingReport | null;
  eventDepts: Dept[];
}

function emptySection(dept: Dept, position: number): Section {
  return { departmentId: dept.id, label: dept.name, position, present: null, absent: null, newcomers: null, notes: "" };
}

export default function EventReportClient({ eventId, statsEnabled, existingReport, eventDepts }: Props) {
  const params = useParams<{ eventId: string }>();
  const id = params?.eventId ?? eventId;

  const initSections = (): Section[] => {
    if (existingReport?.sections.length) {
      return existingReport.sections.map((s) => ({ ...s }));
    }
    // Pré-remplir avec les départements liés
    return eventDepts.map((d, i) => emptySection(d, i));
  };

  const [notes, setNotes] = useState(existingReport?.notes ?? "");
  const [decisions, setDecisions] = useState(existingReport?.decisions ?? "");
  const [sections, setSections] = useState<Section[]>(initSections);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateSection(index: number, field: keyof Section, value: string | number | null) {
    setSections((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setSaved(false);
  }

  function addSection() {
    setSections((prev) => [
      ...prev,
      { departmentId: null, label: "Section libre", position: prev.length, present: null, absent: null, newcomers: null, notes: "" },
    ]);
  }

  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, position: i })));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/events/${id}/report`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes || null, decisions: decisions || null, sections }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  const totalPresent = statsEnabled ? sections.reduce((s, r) => s + (r.present ?? 0), 0) : null;
  const totalAbsent = statsEnabled ? sections.reduce((s, r) => s + (r.absent ?? 0), 0) : null;

  return (
    <div className="space-y-6">
      {/* Récap stats globales */}
      {statsEnabled && (totalPresent !== null || totalAbsent !== null) && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Présents", value: totalPresent, color: "text-green-600 bg-green-50" },
            { label: "Absents", value: totalAbsent, color: "text-red-600 bg-red-50" },
            { label: "Taux de présence", value: (totalPresent ?? 0) + (totalAbsent ?? 0) > 0 ? `${Math.round(((totalPresent ?? 0) / ((totalPresent ?? 0) + (totalAbsent ?? 0))) * 100)}%` : "—", color: "text-icc-violet bg-icc-violet/5" },
          ].map((stat) => (
            <div key={stat.label} className={`rounded-lg border-2 border-gray-100 p-4 text-center ${stat.color}`}>
              <div className="text-2xl font-bold">{stat.value ?? 0}</div>
              <div className="text-xs font-medium mt-1 opacity-70">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Sections par département */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Sections</h2>
          <Button variant="secondary" onClick={addSection}>+ Section libre</Button>
        </div>

        {sections.map((section, i) => (
          <div key={i} className="bg-white rounded-lg border-2 border-gray-100 p-4">
            <div className="flex items-center gap-3 mb-3">
              <input
                type="text"
                value={section.label}
                onChange={(e) => updateSection(i, "label", e.target.value)}
                className="flex-1 text-sm font-semibold text-gray-800 border-0 border-b-2 border-gray-200 focus:border-icc-violet focus:outline-none bg-transparent pb-1"
              />
              {section.department && (
                <span className="text-xs text-gray-400">{section.department.ministry.name}</span>
              )}
              <button
                type="button"
                onClick={() => removeSection(i)}
                className="text-gray-300 hover:text-icc-rouge transition-colors"
                title="Supprimer la section"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {statsEnabled && (
              <div className="grid grid-cols-3 gap-3 mb-3">
                {[
                  { field: "present" as const, label: "Présents", color: "border-green-200 focus:border-green-400" },
                  { field: "absent" as const, label: "Absents", color: "border-red-200 focus:border-red-400" },
                  { field: "newcomers" as const, label: "Visiteurs", color: "border-icc-bleu/40 focus:border-icc-bleu" },
                ].map(({ field, label, color }) => (
                  <div key={field}>
                    <label className="block text-xs text-gray-500 mb-1">{label}</label>
                    <input
                      type="number"
                      min={0}
                      value={section[field] ?? ""}
                      onChange={(e) => updateSection(i, field, e.target.value === "" ? null : parseInt(e.target.value, 10))}
                      placeholder="—"
                      className={`w-full border-2 ${color} rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0`}
                    />
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="block text-xs text-gray-500 mb-1">Observations</label>
              <textarea
                value={section.notes ?? ""}
                onChange={(e) => updateSection(i, "notes", e.target.value || null)}
                rows={2}
                placeholder="Remarques, points de vigilance..."
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent resize-none"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Champs globaux */}
      <div className="bg-white rounded-lg border-2 border-gray-100 p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Observations générales</label>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setSaved(false); }}
            rows={3}
            placeholder="Bilan global de l'événement..."
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Décisions / Actions</label>
          <textarea
            value={decisions}
            onChange={(e) => { setDecisions(e.target.value); setSaved(false); }}
            rows={3}
            placeholder="Décisions prises, actions à mener..."
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent resize-none"
          />
        </div>
      </div>

      {error && <p className="text-sm text-icc-rouge">{error}</p>}

      <div className="flex items-center gap-4">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Enregistrement..." : "Enregistrer le CR"}
        </Button>
        {saved && <span className="text-sm text-green-600 font-medium">CR enregistré ✓</span>}
        <Link href={`/admin/events/${id}`} className="ml-auto text-sm text-gray-500 hover:text-gray-700">
          ← Retour à l&apos;événement
        </Link>
      </div>
    </div>
  );
}
