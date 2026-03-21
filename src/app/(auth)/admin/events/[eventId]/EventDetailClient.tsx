"use client";

import { useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";

interface Department {
  id: string;
  name: string;
  ministryName: string;
  linked: boolean;
}

type PendingAction =
  | { type: "allowAnnouncements" }
  | { type: "trackedForDiscipleship" }
  | { type: "reportEnabled" }
  | { type: "statsEnabled" }
  | { type: "department"; dept: Department };

interface Props {
  eventId: string;
  isRecurring?: boolean;
  allowAnnouncements: boolean;
  trackedForDiscipleship: boolean;
  reportEnabled: boolean;
  statsEnabled: boolean;
  departments: Department[];
}

export default function EventDetailClient({ eventId, isRecurring, allowAnnouncements: initialAllowAnnouncements, trackedForDiscipleship: initialTrackedForDiscipleship, reportEnabled: initialReportEnabled, statsEnabled: initialStatsEnabled, departments }: Props) {
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

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [seriesScope, setSeriesScope] = useState<"single" | "future">("single");

  function requestAction(action: PendingAction) {
    if (!isRecurring) {
      executeAction(action, false);
    } else {
      setSeriesScope("single");
      setPendingAction(action);
    }
  }

  async function executeAction(action: PendingAction, applyToSeries: boolean) {
    setPendingAction(null);

    if (action.type === "allowAnnouncements") {
      setSavingAnnouncements(true);
      try {
        const res = await fetch(`/api/events/${eventId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allowAnnouncements: !allowAnnouncements, applyToSeries }),
        });
        if (!res.ok) { const data = await res.json(); alert(data.error || "Erreur"); return; }
        setAllowAnnouncements((v) => !v);
      } catch { alert("Erreur"); } finally { setSavingAnnouncements(false); }
    } else if (action.type === "trackedForDiscipleship") {
      setSavingDiscipleship(true);
      try {
        const res = await fetch(`/api/events/${eventId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trackedForDiscipleship: !trackedForDiscipleship, applyToSeries }),
        });
        if (!res.ok) { const data = await res.json(); alert(data.error || "Erreur"); return; }
        setTrackedForDiscipleship((v) => !v);
      } catch { alert("Erreur"); } finally { setSavingDiscipleship(false); }
    } else if (action.type === "reportEnabled") {
      setSavingReport(true);
      try {
        const res = await fetch(`/api/events/${eventId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportEnabled: !reportEnabled, applyToSeries }),
        });
        if (!res.ok) { const data = await res.json(); alert(data.error || "Erreur"); return; }
        setReportEnabled((v) => !v);
      } catch { alert("Erreur"); } finally { setSavingReport(false); }
    } else if (action.type === "statsEnabled") {
      setSavingStats(true);
      try {
        const res = await fetch(`/api/events/${eventId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statsEnabled: !statsEnabled, applyToSeries }),
        });
        if (!res.ok) { const data = await res.json(); alert(data.error || "Erreur"); return; }
        setStatsEnabled((v) => !v);
      } catch { alert("Erreur"); } finally { setSavingStats(false); }
    } else if (action.type === "department") {
      const dept = action.dept;
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
    if (action.type === "allowAnnouncements") return allowAnnouncements ? "désactiver les annonces" : "activer les annonces";
    if (action.type === "trackedForDiscipleship") return trackedForDiscipleship ? "désactiver le suivi discipolat" : "activer le suivi discipolat";
    if (action.type === "reportEnabled") return reportEnabled ? "désactiver le compte rendu" : "activer le compte rendu";
    if (action.type === "statsEnabled") return statsEnabled ? "désactiver les statistiques" : "activer les statistiques";
    if (action.type === "department") return action.dept.linked ? `retirer le département «\u00a0${action.dept.name}\u00a0»` : `ajouter le département «\u00a0${action.dept.name}\u00a0»`;
    return "";
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Modifier la série</h3>
            <p className="text-sm text-gray-500 mb-4">
              Vous souhaitez <span className="font-medium text-gray-700">{actionLabel(pendingAction)}</span>. Appliquer à :
            </p>
            <div className="space-y-3 mb-5">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="seriesScope"
                  value="single"
                  checked={seriesScope === "single"}
                  onChange={() => setSeriesScope("single")}
                  className="h-4 w-4 text-icc-violet border-gray-300 focus:ring-icc-violet"
                />
                <span className="text-sm text-gray-700">Cet événement uniquement</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="seriesScope"
                  value="future"
                  checked={seriesScope === "future"}
                  onChange={() => setSeriesScope("future")}
                  className="h-4 w-4 text-icc-violet border-gray-300 focus:ring-icc-violet"
                />
                <span className="text-sm text-gray-700">Cet événement et les suivants de la série</span>
              </label>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setPendingAction(null)}>Annuler</Button>
              <Button onClick={() => executeAction(pendingAction, seriesScope === "future")}>Confirmer</Button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 p-4 bg-white rounded-lg shadow">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Annonces
        </h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            role="switch"
            aria-checked={allowAnnouncements}
            onClick={() => requestAction({ type: "allowAnnouncements" })}
            disabled={savingAnnouncements}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-icc-violet focus:ring-offset-2 disabled:opacity-50 ${
              allowAnnouncements ? "bg-icc-violet" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                allowAnnouncements ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className="text-sm font-medium text-gray-700">
            Accepter les demandes d&apos;annonces
          </span>
          {allowAnnouncements && (
            <span className="text-xs bg-icc-violet/10 text-icc-violet px-2 py-0.5 rounded-full font-medium">
              Actif
            </span>
          )}
        </label>
        <p className="mt-2 text-xs text-gray-500">
          Si activé, cet événement apparaîtra dans le sélecteur lors de la
          soumission d&apos;une annonce.
        </p>
      </div>

      <div className="mb-6 p-4 bg-white rounded-lg shadow">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Discipolat
        </h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            role="switch"
            aria-checked={trackedForDiscipleship}
            onClick={() => requestAction({ type: "trackedForDiscipleship" })}
            disabled={savingDiscipleship}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-icc-violet focus:ring-offset-2 disabled:opacity-50 ${
              trackedForDiscipleship ? "bg-icc-violet" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                trackedForDiscipleship ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className="text-sm font-medium text-gray-700">
            Suivre les présences pour le discipolat
          </span>
          {trackedForDiscipleship && (
            <span className="text-xs bg-icc-violet/10 text-icc-violet px-2 py-0.5 rounded-full font-medium">
              Actif
            </span>
          )}
        </label>
        <p className="mt-2 text-xs text-gray-500">
          Si activé, cet événement apparaîtra dans le module discipolat pour
          l&apos;enregistrement des présences des disciples.
        </p>
      </div>

      <div className="mb-6 p-4 bg-white rounded-lg shadow">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Compte rendu</h2>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              role="switch"
              aria-checked={reportEnabled}
              onClick={() => requestAction({ type: "reportEnabled" })}
              disabled={savingReport}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-icc-violet focus:ring-offset-2 disabled:opacity-50 ${reportEnabled ? "bg-icc-violet" : "bg-gray-200"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${reportEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <span className="text-sm font-medium text-gray-700">Activer le compte rendu</span>
            {reportEnabled && <span className="text-xs bg-icc-violet/10 text-icc-violet px-2 py-0.5 rounded-full font-medium">Actif</span>}
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              role="switch"
              aria-checked={statsEnabled}
              onClick={() => requestAction({ type: "statsEnabled" })}
              disabled={savingStats}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-icc-violet focus:ring-offset-2 disabled:opacity-50 ${statsEnabled ? "bg-icc-violet" : "bg-gray-200"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${statsEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <span className="text-sm font-medium text-gray-700">Activer les statistiques</span>
            {statsEnabled && <span className="text-xs bg-icc-violet/10 text-icc-violet px-2 py-0.5 rounded-full font-medium">Actif</span>}
          </label>
        </div>
        {reportEnabled && (
          <div className="mt-4">
            <Link
              href={`/admin/events/${eventId}/report`}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-icc-violet rounded-lg hover:bg-icc-violet/90 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Saisir / voir le compte rendu
            </Link>
          </div>
        )}
      </div>

      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Départements associés
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(grouped).map(([ministry, deps]) => (
          <div key={ministry} className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">
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
                    className="h-4 w-4 rounded border-gray-300 text-icc-violet focus:ring-icc-violet"
                  />
                  <span className="text-sm text-gray-700">
                    {d.name}
                    {loading === d.id && (
                      <span className="ml-2 text-gray-400">...</span>
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
