"use client";

import { useState, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FileJson } from "lucide-react";
import { Alert, Button, StatusChip, Textarea, buttonClasses, useToast, type StatusTone } from "@/components/ui";
import type { ImportAction, ImportPreview } from "@/modules/campaigns";

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
function splitErrors(message: string): { title: string; items: string[] } {
  const prefix = "Définition invalide : ";
  if (!message.startsWith(prefix)) return { title: message, items: [] };
  return { title: "Définition invalide.", items: message.slice(prefix.length).split(" ; ").filter(Boolean) };
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

/**
 * Import d'une définition de campagne (spec 090) : coller ou déposer un JSON, vérifier (aperçu
 * sans écriture), puis appliquer. `expectedKey` (mise à jour d'une campagne existante) refuse une
 * définition d'une autre campagne, qui en créerait une nouvelle.
 */
export default function ImportCampaign({ expectedKey }: { readonly expectedKey?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<{ title: string; items: string[] } | null>(null);
  const [busy, setBusy] = useState<"check" | "apply" | null>(null);

  function change(value: string) {
    setText(value);
    setPreview(null);
    setError(null);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError({ title: "Fichier trop volumineux (2 Mo au plus).", items: [] });
      return;
    }
    change(await file.text());
  }

  async function send(dryRun: boolean) {
    let definition: unknown;
    try {
      definition = JSON.parse(text);
    } catch {
      setError({ title: "Ce texte n'est pas du JSON valide.", items: [] });
      setPreview(null);
      return;
    }
    setBusy(dryRun ? "check" : "apply");
    setError(null);
    try {
      const res = await fetch("/api/campaigns/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition, dryRun }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const details = Array.isArray(data.details) ? data.details.map((d: { field: string; message: string }) => `${d.field} : ${d.message}`) : [];
        const parsed = splitErrors(data.error ?? "L'import n'a pas abouti.");
        setError({ title: parsed.title, items: [...parsed.items, ...details] });
        if (res.status !== 409) setPreview(null);
        return;
      }
      const result = data as ImportPreview;
      if (dryRun) {
        setPreview(result);
        return;
      }
      toast.success(result.campaign.action === "create" ? "Campagne créée" : "Définition appliquée");
      if (result.campaignId) router.push(`/collectes/${result.campaignId}`);
      router.refresh();
    } catch {
      setError({ title: "Connexion impossible. Réessayez dans un instant.", items: [] });
    } finally {
      setBusy(null);
    }
  }

  const wrongKey = !!preview && !!expectedKey && preview.campaign.key !== expectedKey;
  const blocked = (preview?.blocked.length ?? 0) > 0;
  const changedForms = preview?.forms.filter((f) => f.action !== "unchanged") ?? [];
  const changedAssignments = preview?.assignments.filter((a) => a.action !== "unchanged") ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Textarea
          label="Définition (JSON koinonia.campaign)"
          value={text}
          onChange={(e) => change(e.target.value)}
          rows={10}
          spellCheck={false}
          className="font-mono text-[13px]"
          placeholder='{ "format": "koinonia.campaign", "version": 1, … }'
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className={`${buttonClasses("secondary")} focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus`}>
            <FileJson aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Choisir un fichier JSON
            <input type="file" accept=".json,application/json" className="sr-only" onChange={onFile} />
          </label>
          <Button type="button" variant={preview ? "secondary" : "primary"} disabled={!text.trim() || busy !== null} onClick={() => send(true)}>
            {busy === "check" ? "Vérification…" : "Vérifier"}
          </Button>
        </div>
      </div>

      {error && (
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
      )}

      {preview && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">{preview.campaign.title}</h2>
            <StatusChip tone={ACTION_TONES[preview.campaign.action]}>{CAMPAIGN_ACTION_LABELS[preview.campaign.action]}</StatusChip>
          </div>

          {wrongKey && (
            <Alert tone="danger" title="Autre campagne.">
              Cette définition porte la clé « {preview.campaign.key} », pas celle de cette campagne (« {expectedKey} »). Importez-la
              depuis « Importer une campagne ».
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
              <p className="text-[13px] text-ink-muted">{preview.forms.length - changedForms.length} inchangé(s).</p>
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

          <Block title="Répondants">
            <p className="text-[15px] text-ink">
              {preview.respondents.resolved.length} compte(s) retrouvé(s) par email
              {preview.respondents.resolved.length > 0 && (
                <span className="text-ink-muted"> : {preview.respondents.resolved.map((r) => r.name).join(", ")}</span>
              )}
            </p>
            {preview.respondents.unresolved.length > 0 && (
              <Alert tone="warning" title={`${preview.respondents.unresolved.length} adresse(s) sans compte dans l'église.`}>
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

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" disabled={blocked || wrongKey || busy !== null} onClick={() => send(false)}>
              {busy === "apply" ? "Application…" : preview.campaign.action === "create" ? "Créer la campagne" : "Appliquer"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
