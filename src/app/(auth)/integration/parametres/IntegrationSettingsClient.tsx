"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

interface Settings {
  recontactDelayDays: number;
  missionDelayDays: number;
}

export default function IntegrationSettingsClient({
  churchId,
  settings,
}: {
  readonly churchId: string;
  readonly settings: Settings;
}) {
  const [recontact, setRecontact] = useState(String(settings.recontactDelayDays));
  const [mission, setMission] = useState(String(settings.missionDelayDays));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/integration/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchId,
          recontactDelayDays: Number(recontact),
          missionDelayDays: Number(mission),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erreur lors de l'enregistrement");
      setMessage("Paramètres enregistrés.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 space-y-4">
      <Input
        label="Attente de recontact (jours)"
        type="number"
        min={1}
        max={365}
        value={recontact}
        onChange={(e) => setRecontact(e.target.value)}
      />
      <Input
        label="Attente du département mission (jours)"
        type="number"
        min={1}
        max={365}
        value={mission}
        onChange={(e) => setMission(e.target.value)}
      />
      {message && <p className="text-sm text-green-700">{message}</p>}
      {error && <p className="text-sm text-icc-rouge">{error}</p>}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}
