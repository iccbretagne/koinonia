"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Button from "@/components/ui/Button";
import Link from "next/link";
import { useParams } from "next/navigation";

interface Dept { id: string; name: string; ministryName: string }

interface Section {
  id?: string;
  departmentId: string | null;
  label: string;
  position: number;
  stats: Record<string, number | null> | null;
  notes: string | null;
  department?: { id: string; name: string; ministry: { name: string } } | null;
}

// Section telle que reçue du serveur (stats est JsonValue de Prisma, typé unknown)
interface SectionData extends Omit<Section, "stats"> {
  stats: unknown;
}

interface ExistingReport {
  id: string;
  notes: string | null;
  decisions: string | null;
  sections: SectionData[];
  author: { id: string; name: string | null } | null;
  updatedAt?: string | Date;
}

interface Props {
  eventId: string;
  statsEnabled: boolean;
  existingReport: ExistingReport | null;
  eventDepts: Dept[];
}

// ─── Configuration des champs par type de département ───────────────────────

type FieldConfig = { key: string; label: string; color: string };
type DeptType = "accueil" | "sainte-cene" | "integration" | null;

function norm(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function getDeptType(label: string): DeptType {
  const n = norm(label);
  if (n === "accueil") return "accueil";
  if (n.includes("sainte") && n.includes("cene")) return "sainte-cene";
  if (n === "integration" || n.startsWith("integration")) return "integration";
  return null;
}

const DEPT_FIELDS: Record<Exclude<DeptType, null>, FieldConfig[]> = {
  accueil: [
    { key: "hommes",  label: "Hommes",  color: "border-blue-200 focus:border-blue-400" },
    { key: "femmes",  label: "Femmes",  color: "border-pink-200 focus:border-pink-400" },
    { key: "enfants", label: "Enfants", color: "border-yellow-200 focus:border-yellow-400" },
  ],
  "sainte-cene": [
    { key: "supportsUtilises", label: "Supports utilisés", color: "border-gray-200 focus:border-gray-400" },
    { key: "supportsRestants", label: "Supports restants", color: "border-gray-200 focus:border-gray-400" },
  ],
  integration: [
    { key: "hommes",    label: "Nouveaux arrivants (H)",  color: "border-blue-200 focus:border-blue-400" },
    { key: "femmes",    label: "Nouveaux arrivants (F)",  color: "border-pink-200 focus:border-pink-400" },
    { key: "passage",   label: "De passage",              color: "border-gray-200 focus:border-gray-400" },
    { key: "convertis", label: "Nouveaux convertis",      color: "border-green-200 focus:border-green-400" },
    { key: "voeux",     label: "Renouvellement de vœux",  color: "border-icc-violet/40 focus:border-icc-violet" },
  ],
};

function emptySection(dept: Dept, position: number): Section {
  return { departmentId: dept.id, label: dept.name, position, stats: null, notes: "" };
}

function statVal(stats: Record<string, number | null> | null, key: string): number | null {
  return stats?.[key] ?? null;
}

// ─── Statut de sauvegarde ────────────────────────────────────────────────────

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

function SaveIndicator({ status, error }: { status: SaveStatus; error: string | null }) {
  if (status === "idle") return null;
  const configs: Record<SaveStatus, { cls: string; text: string }> = {
    idle:    { cls: "", text: "" },
    pending: { cls: "text-amber-500", text: "Modifications non sauvegardées…" },
    saving:  { cls: "text-gray-400",  text: "Sauvegarde en cours…" },
    saved:   { cls: "text-green-600", text: "Sauvegardé automatiquement ✓" },
    error:   { cls: "text-icc-rouge", text: error ?? "Erreur de sauvegarde" },
  };
  const { cls, text } = configs[status];
  return (
    <span className={`text-xs font-medium flex items-center gap-1.5 ${cls}`}>
      {status === "saving" && (
        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      )}
      {text}
    </span>
  );
}

// ─── Composant principal ─────────────────────────────────────────────────────

const AUTOSAVE_DELAY = 1500; // ms

export default function EventReportClient({ eventId, statsEnabled, existingReport, eventDepts }: Props) {
  const params = useParams<{ eventId: string }>();
  const id = params?.eventId ?? eventId;

  const initSections = (): Section[] => {
    if (existingReport?.sections.length) {
      return existingReport.sections.map((s) => ({ ...s, stats: (s.stats as Record<string, number | null> | null) ?? null }));
    }
    return eventDepts.map((d, i) => emptySection(d, i));
  };

  const [notes, setNotes] = useState(existingReport?.notes ?? "");
  const [decisions, setDecisions] = useState(existingReport?.decisions ?? "");
  const [sections, setSections] = useState<Section[]>(initSections);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Refs pour accéder aux valeurs les plus récentes dans le callback debounced
  const notesRef = useRef(notes);
  const decisionsRef = useRef(decisions);
  const sectionsRef = useRef(sections);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  notesRef.current = notes;
  decisionsRef.current = decisions;
  sectionsRef.current = sections;

  // ── Avertissement navigation si modifications non sauvegardées ─────────────
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (saveStatus === "pending" || saveStatus === "saving") {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveStatus]);

  // ── Fonction de sauvegarde ─────────────────────────────────────────────────
  const performSave = useCallback(async () => {
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const res = await fetch(`/api/events/${id}/report`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notesRef.current || null,
          decisions: decisionsRef.current || null,
          sections: sectionsRef.current,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setSaveStatus("saved");
      // Repasser en idle après 3s
      setTimeout(() => setSaveStatus((s) => s === "saved" ? "idle" : s), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erreur");
      setSaveStatus("error");
    }
  }, [id]);

  // ── Planifier une sauvegarde automatique ──────────────────────────────────
  function scheduleSave() {
    setSaveStatus("pending");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(performSave, AUTOSAVE_DELAY);
  }

  // Nettoyage au démontage
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // ── Mutations ─────────────────────────────────────────────────────────────
  function updateSectionField(index: number, field: keyof Omit<Section, "stats">, value: string | number | null) {
    setSections((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    scheduleSave();
  }

  function updateStat(index: number, key: string, value: number | null) {
    setSections((prev) => {
      const next = [...prev];
      const current = next[index].stats ?? {};
      next[index] = { ...next[index], stats: { ...current, [key]: value } };
      return next;
    });
    scheduleSave();
  }

  function addSection() {
    setSections((prev) => [
      ...prev,
      { departmentId: null, label: "Section libre", position: prev.length, stats: null, notes: "" },
    ]);
    scheduleSave();
  }

  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, position: i })));
    scheduleSave();
  }

  // Stats globales Accueil
  const accueilSection = sections.find((s) => getDeptType(s.label) === "accueil");
  const totalAdultes = accueilSection
    ? (statVal(accueilSection.stats, "hommes") ?? 0) + (statVal(accueilSection.stats, "femmes") ?? 0)
    : null;
  const totalGeneral = totalAdultes !== null
    ? totalAdultes + (statVal(accueilSection!.stats, "enfants") ?? 0)
    : null;
  const showGlobalRecap = statsEnabled && accueilSection && totalGeneral !== null && totalGeneral > 0;

  return (
    <div className="space-y-6">
      {/* Récap présence globale */}
      {showGlobalRecap && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Hommes",        value: statVal(accueilSection!.stats, "hommes"), color: "text-blue-600 bg-blue-50" },
            { label: "Femmes",        value: statVal(accueilSection!.stats, "femmes"), color: "text-pink-600 bg-pink-50" },
            { label: "Total adultes", value: totalAdultes,                             color: "text-icc-violet bg-icc-violet/5" },
            { label: "Total général", value: totalGeneral,                             color: "text-gray-700 bg-gray-50" },
          ].map((stat) => (
            <div key={stat.label} className={`rounded-lg border-2 border-gray-100 p-4 text-center ${stat.color}`}>
              <div className="text-2xl font-bold">{stat.value ?? 0}</div>
              <div className="text-xs font-medium mt-1 opacity-70">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Sections */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Sections</h2>
          <Button variant="secondary" onClick={addSection}>+ Section libre</Button>
        </div>

        {sections.map((section, i) => {
          const deptType = getDeptType(section.label);
          const fields = deptType ? DEPT_FIELDS[deptType] : null;
          return (
            <div key={i} className="bg-white rounded-lg border-2 border-gray-100 p-4">
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="text"
                  value={section.label}
                  onChange={(e) => updateSectionField(i, "label", e.target.value)}
                  className="flex-1 text-sm font-semibold text-gray-800 border-0 border-b-2 border-gray-200 focus:border-icc-violet focus:outline-none bg-transparent pb-1"
                />
                {section.department && (
                  <span className="text-xs text-gray-400">{section.department.ministry.name}</span>
                )}
                <button type="button" onClick={() => removeSection(i)}
                  className="text-gray-300 hover:text-icc-rouge transition-colors" title="Supprimer">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {statsEnabled && fields && (
                <div className={`grid gap-3 mb-3 ${fields.length <= 2 ? "grid-cols-2" : fields.length <= 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3"}`}>
                  {fields.map(({ key, label, color }) => (
                    <div key={key}>
                      <label className="block text-xs text-gray-500 mb-1">{label}</label>
                      <input
                        type="number" min={0}
                        value={statVal(section.stats, key) ?? ""}
                        onChange={(e) => updateStat(i, key, e.target.value === "" ? null : parseInt(e.target.value, 10))}
                        placeholder="—"
                        className={`w-full border-2 ${color} rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0`}
                      />
                    </div>
                  ))}
                  {deptType === "accueil" && (
                    <>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Total adultes</label>
                        <div className="w-full border-2 border-dashed border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-500 bg-gray-50">
                          {(statVal(section.stats, "hommes") ?? 0) + (statVal(section.stats, "femmes") ?? 0)}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Total adultes + enfants</label>
                        <div className="w-full border-2 border-dashed border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-500 bg-gray-50">
                          {(statVal(section.stats, "hommes") ?? 0) + (statVal(section.stats, "femmes") ?? 0) + (statVal(section.stats, "enfants") ?? 0)}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-500 mb-1">Observations</label>
                <textarea
                  value={section.notes ?? ""}
                  onChange={(e) => updateSectionField(i, "notes", e.target.value || null)}
                  rows={2}
                  placeholder="Remarques, points de vigilance..."
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent resize-none"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Champs globaux */}
      <div className="bg-white rounded-lg border-2 border-gray-100 p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Observations générales</label>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); scheduleSave(); }}
            rows={3}
            placeholder="Bilan global de l'événement..."
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Décisions / Actions</label>
          <textarea
            value={decisions}
            onChange={(e) => { setDecisions(e.target.value); scheduleSave(); }}
            rows={3}
            placeholder="Décisions prises, actions à mener..."
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent resize-none"
          />
        </div>
      </div>

      {/* Barre de bas de page : statut + sauvegarde manuelle + retour */}
      <div className="flex items-center gap-4 py-2">
        <SaveIndicator status={saveStatus} error={saveError} />
        <Button
          variant="secondary"
          onClick={performSave}
          disabled={saveStatus === "saving"}
          className="ml-auto"
        >
          {saveStatus === "saving" ? "Sauvegarde…" : "Enregistrer maintenant"}
        </Button>
        <Link href={`/admin/events/${id}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← Événement
        </Link>
      </div>
    </div>
  );
}
