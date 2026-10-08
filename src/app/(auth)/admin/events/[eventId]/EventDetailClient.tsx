"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";

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
      if (!res.ok) { const data = await res.json(); alert(data.error || "Erreur"); return; }
      toggle.set((v) => !v);
    } catch { alert("Erreur"); } finally { toggle.setSaving(false); }
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
      if (!res.ok) { const data = await res.json(); alert(data.error || "Erreur"); return; }
      setDepts((prev) => prev.map((d) => d.id === dept.id ? { ...d, linked: !d.linked } : d));
    } catch { alert("Erreur"); } finally { setLoading(null); }
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

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        <Link href="/admin/events">
          <Button variant="secondary">&larr; Retour aux evenements</Button>
        </Link>
        <Link href={`/events/${eventId}/star-view`}>
          <Button>Voir planning des STAR</Button>
        </Link>
      </div>

      {/* Modale de confirmation série */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim">
          <div className="bg-surface rounded-xl shadow-overlay p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-ink mb-1">Modifier la série</h3>
            <p className="text-sm text-ink-muted mb-4">
              Vous souhaitez <span className="font-medium text-ink-muted">{actionLabel(pendingAction)}</span>. Appliquer à :
            </p>
            <div className="space-y-3 mb-5">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="seriesScope"
                  value="single"
                  checked={seriesScope === "single"}
                  onChange={() => setSeriesScope("single")}
                  className="h-4 w-4 text-brand-text border-control-line focus:ring-focus"
                />
                <span className="text-sm text-ink-muted">Cet événement uniquement</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="seriesScope"
                  value="future"
                  checked={seriesScope === "future"}
                  onChange={() => setSeriesScope("future")}
                  className="h-4 w-4 text-brand-text border-control-line focus:ring-focus"
                />
                <span className="text-sm text-ink-muted">Cet événement et les suivants de la série</span>
              </label>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setPendingAction(null)}>Annuler</Button>
              <Button onClick={() => executeAction(pendingAction, seriesScope === "future")}>Confirmer</Button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 p-4 bg-surface rounded-lg shadow-card">
        <h2 className="text-lg font-semibold text-ink mb-3">
          Annonces
        </h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            role="switch"
            aria-checked={allowAnnouncements}
            onClick={() => requestAction({ type: "allowAnnouncements" })}
            disabled={savingAnnouncements}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2 disabled:opacity-50 ${
              allowAnnouncements ? "bg-brand" : "bg-surface-sunken"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform ${
                allowAnnouncements ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className="text-sm font-medium text-ink-muted">
            Accepter les demandes d&apos;annonces
          </span>
          {allowAnnouncements && (
            <span className="text-xs bg-brand-soft text-brand-text px-2 py-0.5 rounded-full font-medium">
              Actif
            </span>
          )}
        </label>
        <p className="mt-2 text-xs text-ink-muted">
          Si activé, cet événement apparaîtra dans le sélecteur lors de la
          soumission d&apos;une annonce.
        </p>
      </div>

      <div className="mb-6 p-4 bg-surface rounded-lg shadow-card">
        <h2 className="text-lg font-semibold text-ink mb-3">
          Discipolat
        </h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            role="switch"
            aria-checked={trackedForDiscipleship}
            onClick={() => requestAction({ type: "trackedForDiscipleship" })}
            disabled={savingDiscipleship}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2 disabled:opacity-50 ${
              trackedForDiscipleship ? "bg-brand" : "bg-surface-sunken"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform ${
                trackedForDiscipleship ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className="text-sm font-medium text-ink-muted">
            Suivre les présences pour le discipolat
          </span>
          {trackedForDiscipleship && (
            <span className="text-xs bg-brand-soft text-brand-text px-2 py-0.5 rounded-full font-medium">
              Actif
            </span>
          )}
        </label>
        <p className="mt-2 text-xs text-ink-muted">
          Si activé, cet événement apparaîtra dans le module discipolat pour
          l&apos;enregistrement des présences des disciples.
        </p>
      </div>

      <div className="mb-6 p-4 bg-surface rounded-lg shadow-card">
        <h2 className="text-lg font-semibold text-ink mb-3">Compte rendu</h2>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              role="switch"
              aria-checked={reportEnabled}
              onClick={() => requestAction({ type: "reportEnabled" })}
              disabled={savingReport}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2 disabled:opacity-50 ${reportEnabled ? "bg-brand" : "bg-surface-sunken"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform ${reportEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <span className="text-sm font-medium text-ink-muted">Activer le compte rendu</span>
            {reportEnabled && <span className="text-xs bg-brand-soft text-brand-text px-2 py-0.5 rounded-full font-medium">Actif</span>}
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              role="switch"
              aria-checked={statsEnabled}
              onClick={() => requestAction({ type: "statsEnabled" })}
              disabled={savingStats}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2 disabled:opacity-50 ${statsEnabled ? "bg-brand" : "bg-surface-sunken"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform ${statsEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <span className="text-sm font-medium text-ink-muted">Activer les statistiques</span>
            {statsEnabled && <span className="text-xs bg-brand-soft text-brand-text px-2 py-0.5 rounded-full font-medium">Actif</span>}
          </label>
        </div>
        {reportEnabled && (
          <div className="mt-4">
            <Link
              href={`/admin/events/${eventId}/report`}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-on-brand bg-brand rounded-lg hover:bg-brand-hover transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Saisir / voir le compte rendu
            </Link>
          </div>
        )}
      </div>

      <div className="mb-6 p-4 bg-surface rounded-lg shadow-card">
        <h2 className="text-lg font-semibold text-ink mb-3">Service d&apos;accueil</h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            role="switch"
            aria-checked={welcomeDutyEnabled}
            onClick={() => requestAction({ type: "welcomeDutyEnabled" })}
            disabled={savingWelcomeDuty}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2 disabled:opacity-50 ${welcomeDutyEnabled ? "bg-brand" : "bg-surface-sunken"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform ${welcomeDutyEnabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
          <span className="text-sm font-medium text-ink-muted">Familles de service attendues</span>
          {welcomeDutyEnabled && <span className="text-xs bg-brand-soft text-brand-text px-2 py-0.5 rounded-full font-medium">Actif</span>}
        </label>
        <p className="mt-2 text-xs text-ink-muted">
          Si activé, cet événement apparaît dans le planning d&apos;accueil pour l&apos;affectation des familles.
        </p>
        {welcomeDutyEnabled && (
          <div className="mt-3">
            <Link
              href="/admin/welcome-duty"
              className="inline-flex items-center gap-1.5 text-xs text-brand-text hover:text-brand-text"
            >
              Gérer les affectations →
            </Link>
          </div>
        )}
      </div>

      <h2 className="text-lg font-semibold text-ink mb-4">
        Départements associés
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(grouped).map(([ministry, deps]) => (
          <div key={ministry} className="bg-surface rounded-lg shadow-card p-4">
            <h3 className="text-sm font-semibold text-ink-muted uppercase mb-3">
              {ministry}
            </h3>
            <div className="space-y-2">
              {deps.map((d) => (
                <label
                  key={d.id}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={d.linked}
                    onChange={() => requestAction({ type: "department", dept: d })}
                    disabled={loading === d.id}
                    className="h-4 w-4 rounded border-control-line text-brand-text focus:ring-focus"
                  />
                  <span className="text-sm text-ink-muted">
                    {d.name}
                    {loading === d.id && (
                      <span className="ml-2 text-ink-subtle">...</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
