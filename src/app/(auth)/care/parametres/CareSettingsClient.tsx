"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

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
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
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
        label="Demande non confiée (jours)"
        type="number"
        min={1}
        max={365}
        value={unassigned}
        onChange={(e) => setUnassigned(e.target.value)}
      />
      <Input
        label="Demande confiée sans date fixée (jours)"
        type="number"
        min={1}
        max={365}
        value={unscheduled}
        onChange={(e) => setUnscheduled(e.target.value)}
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
