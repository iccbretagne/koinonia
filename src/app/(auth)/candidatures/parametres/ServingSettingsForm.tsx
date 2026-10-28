"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Input, useToast } from "@/components/ui";
import type { ServingSettingsView } from "@/modules/serving";

interface Props {
  readonly churchId: string;
  readonly initial: ServingSettingsView;
}

export default function ServingSettingsForm({ churchId, initial }: Props) {
  const toast = useToast();
  const [observationMonths, setObservationMonths] = useState(String(initial.observationMonths));
  const [retentionMonths, setRetentionMonths] = useState(String(initial.retentionMonths));
  const [emails, setEmails] = useState<Record<string, string>>(
    Object.fromEntries(initial.pvsDepartments.map((d) => [d.id, d.contactEmail ?? ""]))
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await fetch("/api/serving/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchId,
          observationMonths: Number(observationMonths),
          retentionMonths: Number(retentionMonths),
          pvsEmails: initial.pvsDepartments.map((d) => ({ departmentId: d.id, email: emails[d.id]?.trim() || null })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.details?.length) {
          const errs: Record<string, string> = {};
          for (const d of json.details as { field: string; message: string }[]) {
            const m = /^pvsEmails\.(\d+)\.email$/.exec(d.field);
            errs[m ? initial.pvsDepartments[Number(m[1])].id : d.field] = d.message;
          }
          setErrors(errs);
        }
        toast.error(json.error ?? "Les réglages n'ont pas pu être enregistrés.");
        return;
      }
      toast.success("Réglages enregistrés");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <section className="bg-surface rounded-xl border border-line p-4 sm:p-5 space-y-4">
        <h2 className="text-base font-semibold text-ink">Durées</h2>
        <Input
          label="Durée d'observation (mois)"
          type="number"
          min={1}
          max={12}
          required
          value={observationMonths}
          onChange={(e) => setObservationMonths(e.target.value)}
          error={errors.observationMonths}
          hint="S'applique aux personnes accueillies après l'enregistrement, pas aux observations en cours."
        />
        <Input
          label="Durée de conservation (mois)"
          type="number"
          min={1}
          max={36}
          required
          value={retentionMonths}
          onChange={(e) => setRetentionMonths(e.target.value)}
          error={errors.retentionMonths}
          hint="Une candidature non retenue, jamais traitée ou renvoyée sans réorientation est effacée, photo comprise, au terme de ce délai. Le PVS est prévenu un mois avant l'effacement d'une candidature jamais traitée."
        />
      </section>

      <section className="bg-surface rounded-xl border border-line p-4 sm:p-5 space-y-4">
        <h2 className="text-base font-semibold text-ink">Adresse email du PVS</h2>
        <p className="text-sm text-ink-muted">
          Reçoit une copie des notifications de nouvelle candidature et de renvoi, avec un lien vers Koinonia seulement.
        </p>
        {initial.pvsDepartments.length === 0 ? (
          <Alert tone="warning">
            Aucun département ne porte la fonction « Vie des STAR (PVS) » : le formulaire public est indisponible tant
            qu&apos;elle n&apos;est pas attribuée (Administration › Départements › Fonctions).
          </Alert>
        ) : (
          initial.pvsDepartments.map((d) => (
            <Input
              key={d.id}
              label={d.name}
              type="email"
              placeholder="pvs@exemple.fr"
              value={emails[d.id] ?? ""}
              onChange={(e) => setEmails((prev) => ({ ...prev, [d.id]: e.target.value }))}
              error={errors[d.id]}
            />
          ))
        )}
      </section>

      <Button type="submit" disabled={saving}>
        {saving ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
