"use client";

import { useState } from "react";
import { Alert, Button, Input } from "@/components/ui";

interface Settings {
  firstReminderDays: number;
  reminderIntervalDays: number;
}

/** Délais de relance des justificatifs (spec 078), réglés par la compta pour l'église. */
export default function JustificationSettingsCard({ initial }: { readonly initial: Settings }) {
  const [first, setFirst] = useState(String(initial.firstReminderDays));
  const [every, setEvery] = useState(String(initial.reminderIntervalDays));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = first !== String(initial.firstReminderDays) || every !== String(initial.reminderIntervalDays);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/accounting/justifications/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstReminderDays: Number(first), reminderIntervalDays: Number(every) }),
      });
      const json = await res.json();
      setMessage(res.ok ? { ok: true, text: "Délais enregistrés." } : { ok: false, text: json.error ?? "Valeurs invalides" });
    } catch {
      setMessage({ ok: false, text: "Erreur réseau" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="relances-justificatifs">
      <div>
        <h2 id="relances-justificatifs" className="font-display text-[17px] font-semibold leading-6 text-ink">Relances des justificatifs</h2>
        <p className="mt-0.5 text-[15px] leading-[22px] text-ink-muted">
          Après la remise des fonds, le demandeur est relancé jusqu&apos;au dépôt des factures ; dès la 3e relance, ses
          responsables et le Ministre sont prévenus.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <Input
          label="Première relance (jours)"
          type="number"
          min={1}
          max={60}
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          className="w-28"
        />
        <Input
          label="Puis tous les (jours)"
          type="number"
          min={1}
          max={30}
          value={every}
          onChange={(e) => setEvery(e.target.value)}
          className="w-28"
        />
        <Button type="button" variant="secondary" onClick={save} disabled={busy || !dirty}>
          {busy ? "Enregistrement…" : "Enregistrer les délais"}
        </Button>
      </div>
      {!dirty && !message && <p className="text-[13px] leading-[18px] text-ink-muted">Modifiez un délai pour pouvoir l&apos;enregistrer.</p>}
      {message && (
        <Alert tone={message.ok ? "success" : "danger"} role={message.ok ? "status" : "alert"}>
          {message.text}
        </Alert>
      )}
    </section>
  );
}
