"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, FileJson, FileSpreadsheet } from "lucide-react";
import { Alert, Button, Checkbox, Input, Modal, StatusChip, buttonClasses } from "@/components/ui";
import { parisDayKey, utcDayKey } from "../_components/display";
import { useApi } from "../_components/use-api";
import type { CampaignFormData, CampaignOverviewData } from "./types";

type Campaign = CampaignOverviewData["campaign"];

/**
 * Onglet Export : classeur complet, puis XLSX ou CSV par questionnaire. Les liens visent la route
 * d'export, qui revérifie le droit et journalise chaque téléchargement. Spec 091 : définition de
 * la campagne (format `koinonia.campaign` v1, sans réponse ni personne) et duplication en
 * brouillon (`campaigns:manage`).
 */
export default function ExportTab({
  campaign,
  forms,
  canDuplicate,
}: {
  readonly campaign: Campaign;
  readonly forms: readonly CampaignFormData[];
  readonly canDuplicate: boolean;
}) {
  const campaignId = campaign.id;
  const [duplicating, setDuplicating] = useState(false);
  const url = (format: "xlsx" | "csv", form?: string) =>
    `/api/campaigns/${campaignId}/export?format=${format}${form ? `&form=${encodeURIComponent(form)}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <Alert tone="info" title="Données nominatives possibles.">
        Les exports contiennent toutes les réponses, questionnaires confidentiels compris. Conservez-les en lieu sûr ; chaque
        export est journalisé.
      </Alert>

      <section className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-brand-soft text-brand-text">
            <FileSpreadsheet aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Toute la campagne</h2>
            <p className="text-[13px] leading-[18px] text-ink-muted">
              Classeur Excel : réponses (une ligne par code et destinataire), groupes, états, contrôles, fichiers reçus.
            </p>
          </div>
        </div>
        <a href={url("xlsx")} className={`${buttonClasses("primary")} self-start`}>
          <Download aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Télécharger le classeur (XLSX)
        </a>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-brand-soft text-brand-text">
            <FileJson aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Définition de la campagne</h2>
            <p className="text-[13px] leading-[18px] text-ink-muted">
              Structure, contrôles, confidentialité, échéances et modèles de messages, au format d&apos;import. Jamais de réponse, de
              fichier, de répondant ni de lien : réimporté tel quel, il est annoncé « inchangé ».
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <a href={`/api/campaigns/${campaignId}/definition?download=1`} className={buttonClasses("secondary")}>
            <Download aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Télécharger la définition (JSON)
          </a>
          {canDuplicate && (
            <Button type="button" variant="secondary" onClick={() => setDuplicating(true)}>
              <Copy aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Dupliquer
            </Button>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Par questionnaire</h2>
        <ul className="overflow-hidden rounded-card border border-line bg-surface">
          {forms.map((f) => (
            <li key={f.key} className="flex flex-col gap-2 border-t border-line px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex flex-wrap items-center gap-2 text-[15px] text-ink">
                {f.title}
                {f.confidential && <StatusChip tone="danger">Confidentiel</StatusChip>}
              </span>
              <span className="flex gap-2">
                <a href={url("csv", f.key)} aria-label={`Télécharger ${f.title} en CSV`} className={`${buttonClasses("secondary", "sm")} min-h-11 sm:min-h-9`}>
                  <Download aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  Télécharger en CSV
                </a>
                <a href={url("xlsx", f.key)} aria-label={`Télécharger ${f.title} en XLSX`} className={`${buttonClasses("secondary", "sm")} min-h-11 sm:min-h-9`}>
                  <Download aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  Télécharger en XLSX
                </a>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {duplicating && <DuplicateModal campaign={campaign} onClose={() => setDuplicating(false)} />}
    </div>
  );
}

/** Duplication en brouillon : nouveau titre, nouvelles dates, destinataires conservés ou non. */
function DuplicateModal({ campaign, onClose }: { readonly campaign: Campaign; readonly onClose: () => void }) {
  const router = useRouter();
  const { call, busy } = useApi();
  const [values, setValues] = useState({
    title: `${campaign.title} (copie)`.slice(0, 150),
    periodStart: utcDayKey(campaign.periodStart),
    periodEnd: utcDayKey(campaign.periodEnd),
    dueAt: parisDayKey(campaign.dueAt),
    keepAssignments: true,
  });
  const set = (key: "title" | "periodStart" | "periodEnd" | "dueAt") => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));
  const periodInvalid = !!values.periodStart && !!values.periodEnd && values.periodStart > values.periodEnd;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!values.title.trim() || periodInvalid) return;
    const created = await call<{ campaignId: string | null }>(
      `/api/campaigns/${campaign.id}/duplicate`,
      "POST",
      {
        title: values.title.trim(),
        periodStart: values.periodStart || null,
        periodEnd: values.periodEnd || null,
        dueAt: values.dueAt || null,
        keepAssignments: values.keepAssignments,
      },
      "Campagne dupliquée en brouillon"
    );
    if (created?.campaignId) router.push(`/collectes/${created.campaignId}`);
  }

  return (
    <Modal open onClose={onClose} title="Dupliquer la campagne">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <p className="text-[15px] leading-[22px] text-ink-muted">
          Une nouvelle campagne est créée en brouillon, avec la même structure, les mêmes contrôles, la même confidentialité et les
          mêmes modèles de messages. Rien d&apos;autre n&apos;est copié : ni réponse, ni fichier, ni répondant, ni lien, ni validation.
        </p>
        <Input label="Titre" value={values.title} onChange={set("title")} maxLength={150} required />
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
        <Input label="Échéance" type="date" value={values.dueAt} onChange={set("dueAt")} hint="Fin de journée, heure de Paris. Vide : aucune." />
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-ink">
          <Checkbox checked={values.keepAssignments} onChange={(e) => setValues((v) => ({ ...v, keepAssignments: e.target.checked }))} />
          Conserver les destinataires (sans leur échéance propre ni leurs répondants)
        </label>
        {!values.keepAssignments && (
          <p className="text-[13px] leading-[18px] text-ink-muted">Un destinataire par questionnaire, nommé comme lui, sera créé.</p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" disabled={busy || !values.title.trim() || periodInvalid}>
            {busy ? "Duplication…" : "Dupliquer"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
