"use client";

import type { ReactNode } from "react";
import { Alert, StatusChip, type StatusTone } from "@/components/ui";
import type { ImportAction, ImportPreview } from "@/modules/campaigns";

/**
 * Aperçu d'un import de campagne (spec 090, extrait par la spec 091) : action sur la campagne,
 * blocages (des réponses seraient perdues), questionnaires et destinataires modifiés, répondants.
 * Partagé par l'import JSON et par l'éditeur graphique, qui enregistre par le même import.
 */

const ACTION_LABELS: Record<ImportAction, string> = {
  create: "Ajouté",
  update: "Modifié",
  unchanged: "Inchangé",
  remove: "Supprimé",
};
const CAMPAIGN_ACTION_LABELS: Record<ImportPreview["campaign"]["action"], string> = {
  create: "Campagne créée",
  update: "Campagne modifiée",
  unchanged: "Campagne inchangée",
};
const ACTION_TONES: Record<ImportAction, StatusTone> = {
  create: "success",
  update: "info",
  unchanged: "neutral",
  remove: "danger",
};

/** Message d'erreur de l'API : « Définition invalide : a ; b » devient une liste. */
export function splitErrors(message: string): {
  title: string;
  items: string[];
} {
  const prefix = "Définition invalide : ";
  if (!message.startsWith(prefix)) return { title: message, items: [] };
  return {
    title: "Définition invalide.",
    items: message.slice(prefix.length).split(" ; ").filter(Boolean),
  };
}

function Codes({ label, codes }: { readonly label: string; readonly codes: readonly string[] }) {
  if (codes.length === 0) return null;
  return (
    <p className="text-[13px] leading-[18px] text-ink-muted">
      <span className="font-semibold text-ink">{label} :</span> <span className="break-words font-mono">{codes.join(", ")}</span>
    </p>
  );
}

function Block({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-display text-[15px] font-semibold leading-[22px] text-ink">{title}</h3>
      {children}
    </section>
  );
}

const listClasses = "overflow-hidden rounded-card border border-line bg-surface";
const rowClasses = "flex flex-col gap-1 border-t border-line px-4 py-3 first:border-t-0";

/** Erreur d'import (titre et détails), affichée telle que l'API la renvoie. */
export interface ImportError {
  title: string;
  items: string[];
}

/** Lit l'erreur d'une réponse de `POST /api/campaigns/import`. */
export function importErrorFrom(data: { error?: unknown; details?: unknown }): ImportError {
  const details = Array.isArray(data.details)
    ? data.details.map((d: { field: string; message: string }) => `${d.field} : ${d.message}`)
    : [];
  const parsed = splitErrors(typeof data.error === "string" ? data.error : "L'import n'a pas abouti.");
  return { title: parsed.title, items: [...parsed.items, ...details] };
}

export function ImportErrorAlert({ error }: { readonly error: ImportError }) {
  return (
    <Alert tone="danger" title={error.title}>
      {error.items.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] leading-[18px]">
          {error.items.map((item, i) => (
            <li key={i} className="break-words">
              {item}
            </li>
          ))}
        </ul>
      )}
    </Alert>
  );
}

/** Un aperçu d'import est-il applicable (aucun blocage, bonne campagne) ? */
export function isPreviewBlocked(preview: ImportPreview, expectedKey?: string): boolean {
  return preview.blocked.length > 0 || (!!expectedKey && preview.campaign.key !== expectedKey);
}

export default function ImportPreviewView({
  preview,
  expectedKey,
  showRespondents = true,
}: {
  readonly preview: ImportPreview;
  /** Mise à jour : clé attendue, une autre est signalée. */
  readonly expectedKey?: string;
  /** Répondants retrouvés par email (import JSON) ; l'éditeur n'en porte pas. */
  readonly showRespondents?: boolean;
}) {
  const wrongKey = !!expectedKey && preview.campaign.key !== expectedKey;
  const blocked = preview.blocked.length > 0;
  const changedForms = preview.forms.filter((f) => f.action !== "unchanged");
  const changedAssignments = preview.assignments.filter((a) => a.action !== "unchanged");

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">{preview.campaign.title}</h2>
        <StatusChip tone={ACTION_TONES[preview.campaign.action]}>{CAMPAIGN_ACTION_LABELS[preview.campaign.action]}</StatusChip>
      </div>
      {preview.campaign.action === "update" && preview.campaign.fieldsChanged.length > 0 && (
        <p className="text-[15px] leading-[22px] text-ink">
          <span className="text-ink-muted">Champs de la campagne modifiés : </span>
          {preview.campaign.fieldsChanged.join(", ")}.
        </p>
      )}

      {wrongKey && (
        <Alert tone="danger" title="Autre campagne.">
          Cette définition porte la clé « {preview.campaign.key} », pas celle de cette campagne (« {expectedKey} »). Importez-la depuis «
          Importer une campagne ».
        </Alert>
      )}

      {blocked && (
        <Alert tone="danger" title="Modifications refusées : des réponses seraient perdues.">
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] leading-[18px]">
            {preview.blocked.map((b, i) => (
              <li key={i} className="break-words">
                {[b.formKey, b.code].filter(Boolean).join(" · ")}
                {b.formKey || b.code ? " : " : ""}
                {b.reason}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <Block title={`Questionnaires (${preview.forms.length})`}>
        {changedForms.length === 0 ? (
          <p className="text-[15px] text-ink-muted">Aucun questionnaire modifié.</p>
        ) : (
          <ul className={listClasses}>
            {changedForms.map((f) => (
              <li key={f.key} className={rowClasses}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[15px] font-semibold text-ink">{f.title}</span>
                  <StatusChip tone={ACTION_TONES[f.action]}>{ACTION_LABELS[f.action]}</StatusChip>
                </div>
                <Codes label="Codes ajoutés" codes={f.itemsAdded} />
                <Codes label="Codes modifiés" codes={f.itemsChanged} />
                <Codes label="Codes retirés" codes={f.itemsRemoved} />
              </li>
            ))}
          </ul>
        )}
        {preview.forms.length > changedForms.length && (
          <p className="text-[13px] text-ink-muted">{preview.forms.length - changedForms.length} inchangé{preview.forms.length - changedForms.length > 1 ? "s" : ""}.</p>
        )}
      </Block>

      <Block title={`Destinataires (${preview.assignments.length})`}>
        {changedAssignments.length === 0 ? (
          <p className="text-[15px] text-ink-muted">Aucun destinataire modifié.</p>
        ) : (
          <ul className={listClasses}>
            {changedAssignments.map((a) => (
              <li key={`${a.formKey}/${a.key}`} className={`${rowClasses} sm:flex-row sm:items-center sm:justify-between`}>
                <span className="text-[15px] text-ink">
                  {a.label} <span className="text-[13px] text-ink-muted">({a.formKey})</span>
                </span>
                <StatusChip tone={ACTION_TONES[a.action]}>{ACTION_LABELS[a.action]}</StatusChip>
              </li>
            ))}
          </ul>
        )}
      </Block>

      {showRespondents && (
        <Block title="Répondants">
          <p className="text-[15px] text-ink">
            {preview.respondents.resolved.length} {preview.respondents.resolved.length > 1 ? "comptes retrouvés" : "compte retrouvé"} par email
            {preview.respondents.resolved.length > 0 && (
              <span className="text-ink-muted"> : {preview.respondents.resolved.map((r) => r.name).join(", ")}</span>
            )}
          </p>
          {preview.respondents.unresolved.length > 0 && (
            <Alert tone="warning" title={`${preview.respondents.unresolved.length} ${preview.respondents.unresolved.length > 1 ? "adresses" : "adresse"} sans compte dans l'église.`}>
              Ces personnes ne seront pas ajoutées ; ajoutez-les ensuite dans l&apos;onglet Répondants (compte ou lien personnel).
              <ul className="mt-1 list-disc pl-5 text-[13px] leading-[18px]">
                {preview.respondents.unresolved.map((email) => (
                  <li key={email} className="break-all">
                    {email}
                  </li>
                ))}
              </ul>
            </Alert>
          )}
        </Block>
      )}
    </>
  );
}
