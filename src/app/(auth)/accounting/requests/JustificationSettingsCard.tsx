"use client";

import { useId, useState } from "react";

interface Settings {
  firstReminderDays: number;
  reminderIntervalDays: number;
}

/** Délais de relance des justificatifs (spec 078), réglés par la compta pour l'église. */
export default function JustificationSettingsCard({ initial }: { readonly initial: Settings }) {
  const uid = useId();
  const [first, setFirst] = useState(String(initial.firstReminderDays));
  const [interval, setEvery] = useState(String(initial.reminderIntervalDays));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = first !== String(initial.firstReminderDays) || interval !== String(initial.reminderIntervalDays);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/accounting/justifications/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstReminderDays: Number(first), reminderIntervalDays: Number(interval) }),
      });
      const json = await res.json();
      setMessage(res.ok ? { ok: true, text: "Délais enregistrés." } : { ok: false, text: json.error ?? "Valeurs invalides" });
    } catch {
      setMessage({ ok: false, text: "Erreur réseau" });
    } finally {
      setBusy(false);
    }
  }

  const input = "w-20 border border-control-line rounded-lg px-3 py-2 text-base bg-surface focus:outline-none focus:border-brand";
  return (
    <div className="bg-surface rounded-xl border border-line p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-ink-muted">Relances des justificatifs</h2>
        <p className="text-xs text-ink-subtle mt-0.5">
          Après la remise des fonds, le demandeur est relancé jusqu&apos;au dépôt des factures ; dès la 3e relance, ses
          responsables et le Ministre sont prévenus.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor={`${uid}-first`} className="block text-xs text-ink-muted mb-1">Première relance (jours)</label>
          <input id={`${uid}-first`} type="number" min={1} max={60} value={first} onChange={(e) => setFirst(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor={`${uid}-interval`} className="block text-xs text-ink-muted mb-1">Puis tous les (jours)</label>
          <input id={`${uid}-interval`} type="number" min={1} max={30} value={interval} onChange={(e) => setEvery(e.target.value)} className={input} />
        </div>
        <button
          onClick={save}
          disabled={busy || !dirty}
          className="px-4 py-2 bg-brand text-on-brand text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
      {message && <p className={`text-xs ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</p>}
    </div>
  );
}
