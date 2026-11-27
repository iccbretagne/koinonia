"use client";

import { useState } from "react";
import { Alert, Button, Input, useToast } from "@/components/ui";

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
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
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
      toast.success("Paramètres enregistrés");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
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
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Enregistrement en cours…" : "Enregistrer les délais"}
        </Button>
      </div>
    </div>
  );
}
