"use client";

import { useState } from "react";
import { Alert, Button, Input, useToast } from "@/components/ui";

interface Settings {
  unassignedDelayDays: number;
  unscheduledDelayDays: number;
}

export default function CareSettingsClient({
  churchId,
  settings,
}: {
  readonly churchId: string;
  readonly settings: Settings;
}) {
  const [unassigned, setUnassigned] = useState(String(settings.unassignedDelayDays));
  const [unscheduled, setUnscheduled] = useState(String(settings.unscheduledDelayDays));
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/care/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchId,
          unassignedDelayDays: Number(unassigned),
          unscheduledDelayDays: Number(unscheduled),
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
        label="Demande non confiée (jours)"
        type="number"
        min={1}
        max={365}
        value={unassigned}
        onChange={(e) => setUnassigned(e.target.value)}
      />
      <Input
        label="Demande confiée sans date ni premier contact (jours)"
        type="number"
        min={1}
        max={365}
        value={unscheduled}
        onChange={(e) => setUnscheduled(e.target.value)}
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
