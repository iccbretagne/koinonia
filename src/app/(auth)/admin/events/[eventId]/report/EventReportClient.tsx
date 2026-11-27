"use client";

import { ArrowLeft, Check, FileDown, Loader2, Plus, X } from "lucide-react";
import { useState, useRef, useCallback, useEffect, useId } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import WhatsAppShare from "@/components/WhatsAppShare";
import { Button, IconButton, Input, Textarea, buttonClasses } from "@/components/ui";
import { formatReportWhatsApp, generateReportPDF, type ReportExportData } from "@/lib/report-export";
import { reportSectionType, reportStatFields } from "@/lib/report-stats";

interface Dept { id: string; name: string; ministryName: string }

interface Section {
  id?: string;
  /** Clé de rendu stable côté client (une section peut être retirée) — jamais envoyée au serveur. */
  clientKey: string;
  departmentId: string | null;
  label: string;
  position: number;
  stats: Record<string, number | null> | null;
  notes: string | null;
  department?: { id: string; name: string; ministry: { name: string } } | null;
}

// Section telle que reçue du serveur (stats est JsonValue de Prisma, typé unknown)
interface SectionData extends Omit<Section, "stats" | "clientKey"> {
  stats: unknown;
}

interface ExistingReport {
  id: string;
  speaker: string | null;
  messageTitle: string | null;
  notes: string | null;
  decisions: string | null;
  sections: SectionData[];
  author: { id: string; name: string | null } | null;
  updatedAt?: string | Date;
}

interface Props {
  readonly eventId: string;
  readonly eventTitle: string;
  readonly eventDate: string;
  readonly eventType: string;
  readonly statsEnabled: boolean;
  readonly existingReport: ExistingReport | null;
  readonly eventDepts: Dept[];
}

// ─── Configuration des champs par type de département ───────────────────────


let sectionKeySeq = 0;
function newSectionKey() {
  sectionKeySeq += 1;
  return `section-${sectionKeySeq}`;
}

function emptySection(dept: Dept, position: number): Section {
  return { clientKey: newSectionKey(), departmentId: dept.id, label: dept.name, position, stats: null, notes: "" };
}

function statsGridClass(fieldCount: number): string {
  if (fieldCount <= 2) return "grid-cols-2";
  return fieldCount <= 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3";
}

function statVal(stats: Record<string, number | null> | null, key: string): number | null {
  return stats?.[key] ?? null;
}

// ─── Statut de sauvegarde ────────────────────────────────────────────────────

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

function SaveIndicator({ status, error }: { readonly status: SaveStatus; readonly error: string | null }) {
  if (status === "idle") return null;
  const configs: Record<SaveStatus, { cls: string; text: string }> = {
    idle:    { cls: "", text: "" },
    pending: { cls: "text-ink-muted", text: "Modifications non sauvegardées" },
    saving:  { cls: "text-ink-muted",  text: "Sauvegarde…" },
    saved:   { cls: "text-success", text: "Sauvegardé automatiquement" },
    error:   { cls: "text-danger", text: error ?? "Erreur de sauvegarde" },
  };
  const { cls, text } = configs[status];
  return (
    <span role="status" className={`flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] ${cls}`}>
      {status === "saving" && <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}
      {status === "saved" && <Check aria-hidden="true" className="size-3.5" />}
      {text}
    </span>
  );
}

// ─── Composant principal ─────────────────────────────────────────────────────

const AUTOSAVE_DELAY = 1500; // ms

export default function EventReportClient({ eventId, eventTitle, eventDate, eventType, statsEnabled, existingReport, eventDepts }: Props) {
  const uid = useId();
  const params = useParams<{ eventId: string }>();
  const id = params?.eventId ?? eventId;

  const initSections = (): Section[] => {
    if (existingReport?.sections.length) {
      return existingReport.sections.map((s) => ({
        ...s,
        clientKey: s.id ?? newSectionKey(),
        stats: (s.stats as Record<string, number | null> | null) ?? null,
      }));
    }
    return eventDepts.map((d, i) => emptySection(d, i));
  };

  const [speaker, setSpeaker] = useState(existingReport?.speaker ?? "");
  const [messageTitle, setMessageTitle] = useState(existingReport?.messageTitle ?? "");
  const [notes, setNotes] = useState(existingReport?.notes ?? "");
  const [decisions, setDecisions] = useState(existingReport?.decisions ?? "");
  const [sections, setSections] = useState<Section[]>(initSections);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Refs pour accéder aux valeurs les plus récentes dans le callback debounced
  const speakerRef = useRef(speaker);
  const messageTitleRef = useRef(messageTitle);
  const notesRef = useRef(notes);
  const decisionsRef = useRef(decisions);
  const sectionsRef = useRef(sections);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    speakerRef.current = speaker;
    messageTitleRef.current = messageTitle;
    notesRef.current = notes;
    decisionsRef.current = decisions;
    sectionsRef.current = sections;
  });

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
          speaker: speakerRef.current || null,
          messageTitle: messageTitleRef.current || null,
          notes: notesRef.current || null,
          decisions: decisionsRef.current || null,
          sections: sectionsRef.current.map(({ clientKey: _clientKey, ...section }) => section),
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
      { clientKey: newSectionKey(), departmentId: null, label: "Section libre", position: prev.length, stats: null, notes: "" },
    ]);
    scheduleSave();
  }

  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, position: i })));
    scheduleSave();
  }

  // ── Export helpers ─────────────────────────────────────────────────────────
  function buildExportData(): ReportExportData {
    return {
      event: { title: eventTitle, date: eventDate, type: eventType },
      notes: notes || null,
      decisions: decisions || null,
      sections: sections.map((s) => ({
        label: s.label,
        position: s.position,
        stats: s.stats,
        notes: s.notes,
      })),
      author: existingReport?.author?.name ?? null,
    };
  }

  function handleExportPDF() {
    generateReportPDF(buildExportData());
  }

  // Stats globales Accueil
  const accueilSection = sections.find((s) => reportSectionType(s.label) === "accueil");
  const totalAdultes = accueilSection
    ? (statVal(accueilSection.stats, "hommes") ?? 0) + (statVal(accueilSection.stats, "femmes") ?? 0)
    : null;
  const totalGeneral = totalAdultes !== null
    ? totalAdultes + (statVal(accueilSection!.stats, "enfants") ?? 0)
    : null;
  const showGlobalRecap = statsEnabled && accueilSection && totalGeneral !== null && totalGeneral > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Récap présence globale */}
      {showGlobalRecap && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Hommes",        value: statVal(accueilSection!.stats, "hommes") },
            { label: "Femmes",        value: statVal(accueilSection!.stats, "femmes") },
            { label: "Total adultes", value: totalAdultes },
            { label: "Total général", value: totalGeneral },
          ].map((stat) => (
            <div key={stat.label} className="rounded-card border border-line bg-surface p-4 text-center shadow-card">
              <div className="font-display text-2xl font-bold text-ink">{stat.value ?? 0}</div>
              <div className="mt-1 text-[13px] leading-[18px] text-ink-muted">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Navigation + export */}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={handleExportPDF}>
          <FileDown className="size-4" aria-hidden="true" strokeWidth={1.75} />
          Exporter en PDF
        </Button>
        <WhatsAppShare getText={() => formatReportWhatsApp(buildExportData())} copiedMessage="Compte rendu copié" size="sm" />
      </div>

      {/* Orateur et titre du message */}
      <div className="rounded-card border border-line bg-surface p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            id={`${uid}-speaker`}
            label="Orateur"
            type="text"
            value={speaker}
            onChange={(e) => { setSpeaker(e.target.value); scheduleSave(); }}
            placeholder="Nom de l'orateur"
          />
          <Input
            id={`${uid}-message-title`}
            label="Titre du message"
            type="text"
            value={messageTitle}
            onChange={(e) => { setMessageTitle(e.target.value); scheduleSave(); }}
            placeholder="Titre du message"
          />
        </div>
      </div>

      {/* Sections */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Sections</h2>
          <Button type="button" variant="secondary" size="sm" onClick={addSection}>
            <Plus className="size-4" aria-hidden="true" strokeWidth={1.75} />
            Ajouter une section libre
          </Button>
        </div>

        {sections.map((section, i) => {
          const deptType = reportSectionType(section.label);
          const fields = reportStatFields(section.label);
          return (
            <div key={section.clientKey} className="rounded-card border border-line bg-surface p-4">
              <div className="mb-3 flex items-center gap-3">
                <input
                  type="text"
                  aria-label="Nom de la section"
                  value={section.label}
                  onChange={(e) => updateSectionField(i, "label", e.target.value)}
                  className="min-h-11 min-w-0 flex-1 border-0 border-b-2 border-line bg-transparent pb-1 text-base font-semibold text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                />
                {section.department && (
                  <span className="text-[13px] leading-[18px] text-ink-muted">{section.department.ministry.name}</span>
                )}
                <IconButton icon={X} size="sm" aria-label={`Retirer la section ${section.label}`} title="Retirer la section" onClick={() => removeSection(i)} />
              </div>

              {statsEnabled && fields && (
                <div className={`grid gap-3 mb-3 ${statsGridClass(fields.length)}`}>
                  {fields.map(({ key, label }) => (
                    <Input
                      key={key}
                      label={label}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={statVal(section.stats, key) ?? ""}
                      onChange={(e) => updateStat(i, key, e.target.value === "" ? null : Number.parseInt(e.target.value, 10))}
                      placeholder="—"
                    />
                  ))}
                  {(deptType === "accueil" || deptType === "navette") && (
                    <>
                      <div>
                        <p className="mb-1 text-sm font-semibold text-ink">Total adultes</p>
                        <div className="flex min-h-11 items-center rounded-control border border-dashed border-line px-3 text-base text-ink-muted">
                          {(statVal(section.stats, "hommes") ?? 0) + (statVal(section.stats, "femmes") ?? 0)}
                        </div>
                      </div>
                      <div>
                        <p className="mb-1 text-sm font-semibold text-ink">Total adultes + enfants</p>
                        <div className="flex min-h-11 items-center rounded-control border border-dashed border-line px-3 text-base text-ink-muted">
                          {(statVal(section.stats, "hommes") ?? 0) + (statVal(section.stats, "femmes") ?? 0) + (statVal(section.stats, "enfants") ?? 0)}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              <Textarea
                id={`${uid}-section-notes-${i}`}
                label="Observations"
                value={section.notes ?? ""}
                onChange={(e) => updateSectionField(i, "notes", e.target.value || null)}
                rows={2}
                placeholder="Remarques, points de vigilance…"
              />
            </div>
          );
        })}
      </div>

      {/* Champs globaux */}
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
        <Textarea
          id={`${uid}-notes`}
          label="Observations générales"
          value={notes}
          onChange={(e) => { setNotes(e.target.value); scheduleSave(); }}
          rows={3}
          placeholder="Bilan global de l'événement…"
        />
        <Textarea
          id={`${uid}-decisions`}
          label="Décisions / Actions"
          value={decisions}
          onChange={(e) => { setDecisions(e.target.value); scheduleSave(); }}
          rows={3}
          placeholder="Décisions prises, actions à mener…"
        />
      </div>

      {/* Barre de bas de page : statut + sauvegarde manuelle + retour */}
      <div className="flex flex-wrap items-center gap-4 py-2">
        <SaveIndicator status={saveStatus} error={saveError} />
        <Button type="button" className="ml-auto" onClick={performSave} disabled={saveStatus === "saving"}>
          {saveStatus === "saving" ? "Enregistrement…" : "Enregistrer maintenant"}
        </Button>
      </div>
        <Link href="/admin/reports" className={`${buttonClasses("ghost")} self-start`}>
          <ArrowLeft className="size-4" aria-hidden="true" strokeWidth={1.75} />
          Revenir aux comptes rendus
        </Link>
    </div>
  );
}
