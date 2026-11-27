"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Button, Checkbox, Modal, RadioGroup, StatusChip, buttonClasses, useToast } from "@/components/ui";

interface Department {
  id: string;
  name: string;
  ministryName: string;
  linked: boolean;
}

type ToggleField = "allowAnnouncements" | "trackedForDiscipleship" | "reportEnabled" | "statsEnabled" | "welcomeDutyEnabled";

type PendingAction = { type: ToggleField } | { type: "department"; dept: Department };

/** Objet de chaque réglage, pour le libellé « activer/désactiver … » de la confirmation. */
const TOGGLE_LABELS: Record<ToggleField, string> = {
  allowAnnouncements: "les annonces",
  trackedForDiscipleship: "le suivi discipolat",
  reportEnabled: "le compte rendu",
  statsEnabled: "les statistiques",
  welcomeDutyEnabled: "le service d'accueil",
};

interface Props {
  readonly eventId: string;
  readonly isRecurring?: boolean;
  readonly allowAnnouncements: boolean;
  readonly trackedForDiscipleship: boolean;
  readonly reportEnabled: boolean;
  readonly statsEnabled: boolean;
  readonly welcomeDutyEnabled: boolean;
  readonly departments: Department[];
}

export default function EventDetailClient({ eventId, isRecurring, allowAnnouncements: initialAllowAnnouncements, trackedForDiscipleship: initialTrackedForDiscipleship, reportEnabled: initialReportEnabled, statsEnabled: initialStatsEnabled, welcomeDutyEnabled: initialWelcomeDutyEnabled, departments }: Props) {
  const [depts, setDepts] = useState(departments);
  const [loading, setLoading] = useState<string | null>(null);
  const [allowAnnouncements, setAllowAnnouncements] = useState(initialAllowAnnouncements);
  const [savingAnnouncements, setSavingAnnouncements] = useState(false);
  const [trackedForDiscipleship, setTrackedForDiscipleship] = useState(initialTrackedForDiscipleship);
  const [savingDiscipleship, setSavingDiscipleship] = useState(false);
  const [reportEnabled, setReportEnabled] = useState(initialReportEnabled);
  const [savingReport, setSavingReport] = useState(false);
  const [statsEnabled, setStatsEnabled] = useState(initialStatsEnabled);
  const [savingStats, setSavingStats] = useState(false);
  const [welcomeDutyEnabled, setWelcomeDutyEnabled] = useState(initialWelcomeDutyEnabled);
  const [savingWelcomeDuty, setSavingWelcomeDuty] = useState(false);

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [seriesScope, setSeriesScope] = useState<"single" | "future">("single");
  const toast = useToast();

  function requestAction(action: PendingAction) {
    if (!isRecurring) {
      void executeAction(action, false);
    } else {
      setSeriesScope("single");
      setPendingAction(action);
    }
  }

  const toggles: Record<ToggleField, { value: boolean; set: Dispatch<SetStateAction<boolean>>; setSaving: (saving: boolean) => void }> = {
    allowAnnouncements: { value: allowAnnouncements, set: setAllowAnnouncements, setSaving: setSavingAnnouncements },
    trackedForDiscipleship: { value: trackedForDiscipleship, set: setTrackedForDiscipleship, setSaving: setSavingDiscipleship },
    reportEnabled: { value: reportEnabled, set: setReportEnabled, setSaving: setSavingReport },
    statsEnabled: { value: statsEnabled, set: setStatsEnabled, setSaving: setSavingStats },
    welcomeDutyEnabled: { value: welcomeDutyEnabled, set: setWelcomeDutyEnabled, setSaving: setSavingWelcomeDuty },
  };

  /** Bascule un réglage de l'événement (ou de la série). */
  async function patchToggle(field: ToggleField, applyToSeries: boolean) {
    const toggle = toggles[field];
    toggle.setSaving(true);
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: !toggle.value, applyToSeries }),
      });
      if (!res.ok) { const data = await res.json(); toast.error(data.error || "Erreur lors de l'enregistrement"); return; }
      toggle.set((v) => !v);
    } catch { toast.error("Erreur lors de l'enregistrement"); } finally { toggle.setSaving(false); }
  }

  /** Ajoute ou retire un département de l'événement (ou de la série). */
  async function toggleDepartment(dept: Department, applyToSeries: boolean) {
    setLoading(dept.id);
    try {
      const method = dept.linked ? "DELETE" : "POST";
      const res = await fetch(`/api/events/${eventId}/departments`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: dept.id, applyToSeries }),
      });
      if (!res.ok) { const data = await res.json(); toast.error(data.error || "Erreur lors de l'enregistrement"); return; }
      setDepts((prev) => prev.map((d) => d.id === dept.id ? { ...d, linked: !d.linked } : d));
    } catch { toast.error("Erreur lors de l'enregistrement"); } finally { setLoading(null); }
  }

  async function executeAction(action: PendingAction, applyToSeries: boolean) {
    setPendingAction(null);
    if (action.type === "department") await toggleDepartment(action.dept, applyToSeries);
    else await patchToggle(action.type, applyToSeries);
  }

  const grouped = depts.reduce(
    (acc, d) => {
      if (!acc[d.ministryName]) acc[d.ministryName] = [];
      acc[d.ministryName].push(d);
      return acc;
    },
    {} as Record<string, Department[]>
  );

  function actionLabel(action: PendingAction): string {
    if (action.type === "department") return action.dept.linked ? `retirer le département «\u00a0${action.dept.name}\u00a0»` : `ajouter le département «\u00a0${action.dept.name}\u00a0»`;
    return `${toggles[action.type].value ? "désactiver" : "activer"} ${TOGGLE_LABELS[action.type]}`;
  }

  /** Réglage activable de l'événement : case à cocher de 44 px, état « Actif » et aide. */
  function toggleRow(field: ToggleField, label: string, saving: boolean, hint?: string) {
    const on = toggles[field].value;
    return (
      <div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <Checkbox checked={on} disabled={saving} onChange={() => requestAction({ type: field })} />
          <span className="text-[15px] font-semibold leading-[22px] text-ink">{label}</span>
          {saving ? <span className="text-[13px] text-ink-muted">Enregistrement…</span> : on && <StatusChip tone="brand">Actif</StatusChip>}
        </label>
        {hint && <p className="text-[13px] leading-[18px] text-ink-muted">{hint}</p>}
      </div>
    );
  }

  const SECTION = "rounded-card border border-line bg-surface p-4 shadow-card";
  const H2 = "mb-3 font-display text-[17px] font-semibold leading-6 text-ink";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <Link href={`/events/${eventId}/star-view`} className={buttonClasses("secondary")}>
          Voir le planning des STAR
        </Link>
      </div>

      {/* Modale de confirmation série */}
      <Modal open={pendingAction !== null} onClose={() => setPendingAction(null)} title="Modifier la série">
        {pendingAction && (
          <div className="flex flex-col gap-4">
            <p className="text-[15px] leading-[22px] text-ink-muted">
              Vous souhaitez <span className="font-semibold text-ink">{actionLabel(pendingAction)}</span>. Appliquer à :
            </p>
            <RadioGroup
              legend="Portée de la modification"
              hideLegend
              name="seriesScope"
              value={seriesScope}
              onChange={setSeriesScope}
              options={[
                { value: "single", label: "Cet événement uniquement" },
                { value: "future", label: "Cet événement et les suivants de la série" },
              ]}
            />
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setPendingAction(null)}>Annuler</Button>
              <Button onClick={() => executeAction(pendingAction, seriesScope === "future")}>Appliquer</Button>
            </div>
          </div>
        )}
      </Modal>

      <section className={SECTION}>
        <h2 className={H2}>Annonces</h2>
        {toggleRow("allowAnnouncements", "Accepter les demandes d'annonces", savingAnnouncements, "Si activé, cet événement apparaîtra dans le sélecteur lors de la soumission d'une annonce.")}
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Discipolat</h2>
        {toggleRow("trackedForDiscipleship", "Suivre les présences pour le discipolat", savingDiscipleship, "Si activé, cet événement apparaîtra dans le module discipolat pour l'enregistrement des présences des disciples.")}
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Compte rendu</h2>
        <div className="flex flex-col gap-1">
          {toggleRow("reportEnabled", "Activer le compte rendu", savingReport)}
          {toggleRow("statsEnabled", "Activer les statistiques", savingStats)}
        </div>
        {reportEnabled && (
          <div className="mt-4">
            <Link href={`/admin/events/${eventId}/report`} className={buttonClasses("primary")}>
              <FileText aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Saisir le compte rendu
            </Link>
          </div>
        )}
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Service d&apos;accueil</h2>
        {toggleRow("welcomeDutyEnabled", "Familles de service attendues", savingWelcomeDuty, "Si activé, cet événement apparaît dans le planning d'accueil pour l'affectation des familles.")}
        {welcomeDutyEnabled && (
          <div className="mt-3">
            <Link href="/admin/welcome-duty" className={buttonClasses("secondary", "sm")}>
              Gérer les affectations
            </Link>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 font-display text-[17px] font-semibold leading-6 text-ink">Départements associés</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(grouped).map(([ministry, deps]) => (
            <div key={ministry} className={SECTION}>
              <h3 className="mb-2 font-display text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-subtle">
                {ministry}
              </h3>
              <div className="flex flex-col">
                {deps.map((d) => (
                  <label key={d.id} className="flex min-h-11 cursor-pointer items-center gap-3">
                    <Checkbox
                      checked={d.linked}
                      onChange={() => requestAction({ type: "department", dept: d })}
                      disabled={loading === d.id}
                    />
                    <span className="text-[15px] leading-[22px] text-ink">
                      {d.name}
                      {loading === d.id && <span className="ml-2 text-[13px] text-ink-muted">Enregistrement…</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
