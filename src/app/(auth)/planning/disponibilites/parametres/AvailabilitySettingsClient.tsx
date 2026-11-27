"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Checkbox from "@/components/ui/Checkbox";
import Alert from "@/components/ui/Alert";
import { useToast } from "@/components/ui/Toast";

interface Settings {
  enabled: boolean;
  openMonthsBefore: number;
  closeDaysBefore: number;
  relanceDaysBefore: number;
  planningNoticeDelayMinutes: number;
}

export default function AvailabilitySettingsClient({
  churchId,
  settings,
}: {
  readonly churchId: string;
  readonly settings: Settings;
}) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [open, setOpen] = useState(String(settings.openMonthsBefore));
  const [close, setClose] = useState(String(settings.closeDaysBefore));
  const [relance, setRelance] = useState(String(settings.relanceDaysBefore));
  const [noticeDelay, setNoticeDelay] = useState(String(settings.planningNoticeDelayMinutes));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/availability/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchId,
          enabled,
          openMonthsBefore: Number(open),
          closeDaysBefore: Number(close),
          relanceDaysBefore: Number(relance),
          planningNoticeDelayMinutes: Number(noticeDelay),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erreur lors de l'enregistrement");
      toast.success("Paramètres enregistrés");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <label className="flex min-h-11 items-center gap-3 text-[15px] leading-[22px] text-ink">
        <Checkbox checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>Collecte automatique activée</span>
      </label>
      <Input
        label="Ouverture : combien de mois avant le mois concerné"
        type="number"
        min={1}
        max={6}
        value={open}
        onChange={(e) => setOpen(e.target.value)}
      />
      <Input
        label="Clôture : combien de jours avant le début du mois"
        type="number"
        min={1}
        max={30}
        value={close}
        onChange={(e) => setClose(e.target.value)}
      />
      <Input
        label="Relance des sans-réponse : combien de jours avant la clôture"
        type="number"
        min={1}
        max={30}
        value={relance}
        onChange={(e) => setRelance(e.target.value)}
      />
      <div className="border-t border-line pt-4 space-y-4">
        <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Changements de planning</h2>
        <Input
          label="Délai avant l'envoi (minutes)"
          type="number"
          min={5}
          max={120}
          value={noticeDelay}
          onChange={(e) => setNoticeDelay(e.target.value)}
          hint="Les STAR reçoivent un seul récapitulatif une fois que leur planning n'a plus changé pendant ce délai (de 5 minutes à 2 heures)."
        />
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}
