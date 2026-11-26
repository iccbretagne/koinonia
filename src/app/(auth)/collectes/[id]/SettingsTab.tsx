"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { FileJson } from "lucide-react";
import { Button, Input, Textarea, buttonClasses } from "@/components/ui";
import { FILE_RETENTION_DAYS } from "@/modules/campaigns/schemas";
import { parisDayKey, utcDayKey } from "../_components/display";
import { useApi } from "../_components/use-api";
import type { CampaignOverviewData } from "./types";

type Campaign = CampaignOverviewData["campaign"];

function initial(c: Campaign) {
  return {
    title: c.title,
    description: c.description ?? "",
    periodStart: utcDayKey(c.periodStart),
    periodEnd: utcDayKey(c.periodEnd),
    dueAt: parisDayKey(c.dueAt),
    fileRetentionDays: String(c.fileRetentionDays),
  };
}

/**
 * Onglet Paramètres : seuls les champs modifiés sont envoyés (une échéance inchangée garde son
 * heure exacte). La définition (questionnaires, destinataires) se met à jour par réimport.
 */
export default function SettingsTab({ campaign }: { readonly campaign: Campaign }) {
  const { call, busy } = useApi();
  const [saved, setSaved] = useState(() => initial(campaign));
  const [values, setValues] = useState(saved);
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const retention = Number(values.fileRetentionDays);
  const retentionValid = Number.isInteger(retention) && retention >= FILE_RETENTION_DAYS.min && retention <= FILE_RETENTION_DAYS.max;
  const periodInvalid = !!values.periodStart && !!values.periodEnd && values.periodStart > values.periodEnd;
  const changed = (Object.keys(values) as (keyof typeof values)[]).filter((k) => values[k] !== saved[k]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!values.title.trim() || !retentionValid || periodInvalid || changed.length === 0) return;
    const body: Record<string, unknown> = {};
    for (const k of changed) {
      if (k === "fileRetentionDays") body[k] = retention;
      else if (k === "title") body[k] = values.title.trim();
      else body[k] = values[k] || null;
    }
    const done = await call(`/api/campaigns/${campaign.id}`, "PATCH", body, "Paramètres enregistrés");
    if (done) setSaved(values);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Input label="Titre" value={values.title} onChange={set("title")} maxLength={150} required />
        <Textarea label="Description" value={values.description} onChange={set("description")} rows={4} maxLength={5000} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Début de la période" type="date" value={values.periodStart} onChange={set("periodStart")} />
          <Input
            label="Date d'arrêté"
            type="date"
            value={values.periodEnd}
            onChange={set("periodEnd")}
            error={periodInvalid ? "La fin de période doit suivre son début" : undefined}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Échéance" type="date" value={values.dueAt} onChange={set("dueAt")} hint="Fin de journée, heure de Paris." />
          <Input
            label="Conservation des fichiers (jours)"
            type="number"
            inputMode="numeric"
            min={FILE_RETENTION_DAYS.min}
            max={FILE_RETENTION_DAYS.max}
            value={values.fileRetentionDays}
            onChange={set("fileRetentionDays")}
            hint={`Après la clôture, puis suppression automatique. ${FILE_RETENTION_DAYS.default} par défaut.`}
            error={retentionValid ? undefined : `Entre ${FILE_RETENTION_DAYS.min} et ${FILE_RETENTION_DAYS.max} jours`}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="submit" disabled={busy || changed.length === 0 || !values.title.trim() || !retentionValid || periodInvalid}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </form>

      <section className="flex flex-col gap-3 rounded-card border border-line bg-surface px-4 py-4">
        <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Définition de la campagne</h2>
        <p className="text-[15px] leading-[22px] text-ink-muted">
          Questionnaires, questions, destinataires et répondants se mettent à jour en réimportant la définition JSON. Aucune réponse
          saisie n&apos;est perdue : une modification qui en ferait perdre est refusée.
        </p>
        <Link href={`/collectes/${campaign.id}/import`} className={`${buttonClasses("secondary")} self-start`}>
          <FileJson aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Mettre à jour la définition
        </Link>
      </section>
    </div>
  );
}
