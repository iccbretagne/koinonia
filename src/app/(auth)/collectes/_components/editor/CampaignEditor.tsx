"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Plus } from "lucide-react";
import { Alert, Button, ConfirmModal, Input, Modal, Select, StatusChip, Textarea, buttonClasses, useToast } from "@/components/ui";
import {
  DEFAULT_MESSAGE_TEMPLATES,
  FILE_RETENTION_DAYS,
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  MESSAGE_KINDS,
  MESSAGE_KIND_LABELS,
  MESSAGE_PLACEHOLDERS,
  MESSAGE_TEMPLATE_MAX_LENGTH,
  type CampaignDefinition,
  type DefinitionItem,
  type ItemType,
  type MessageKind,
} from "@/modules/campaigns/schemas";
import type { ImportPreview } from "@/modules/campaigns";
import AssignmentPreview from "@/components/campaigns/AssignmentPreview";
import { useLeaveGuard } from "@/app/(auth)/dons/use-leave-guard";
import ImportPreviewView, { ImportErrorAlert, importErrorFrom, isPreviewBlocked, type ImportError } from "../ImportPreviewView";
import { parisDayKey } from "../display";
import {
  addAssignment,
  addForm,
  addItem,
  addRule,
  addSection,
  collectIds,
  describeTarget,
  duplicateForm,
  duplicateItem,
  duplicateSection,
  issuesByTarget,
  move,
  moveAssignment,
  moveForm,
  moveItem,
  moveItemToSection,
  moveSection,
  removeAssignment,
  removeForm,
  removeItem,
  removeRule,
  removeSection,
  ruleCandidates,
  snapshot,
  targetId,
  updateAssignment,
  updateForm,
  updateItem,
  updateRule,
  updateSection,
  validateEditor,
  withOptional,
} from "./state";
import ItemEditor from "./ItemEditor";
import RuleEditor from "./RuleEditor";
import { CheckField, Disclosure, IssueCount, IssueList, NumberField, RowActions } from "./fields";
import { paths } from "@/lib/paths";

/**
 * Éditeur graphique d'une campagne (spec 091, EVOL-11). Son état est le document
 * `koinonia.campaign` v1 complet, transformé par les fonctions pures de `state.ts`, validé en
 * continu par le même schéma et les mêmes contrôles que l'import. « Enregistrer » passe par
 * l'import (aperçu, blocages, révisions) : aucun autre chemin d'écriture de la structure.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Jour affiché d'une échéance : un jour tel quel, un instant ramené à son jour à Paris. */
const dueDay = (value: string | undefined) => (!value ? "" : DAY.test(value) ? value : parisDayKey(value));

type Pending = { title: string; message: string; run: () => void } | null;

function Card({ children, className = "" }: { readonly children: ReactNode; readonly className?: string }) {
  return <section className={`rounded-card border border-line bg-surface ${className}`}>{children}</section>;
}

export default function CampaignEditor({
  initial,
  campaignId,
  backHref,
  notice,
}: {
  readonly initial: CampaignDefinition;
  /** Édition d'une campagne existante (envoyé à l'import) ; absent : création. */
  readonly campaignId?: string;
  readonly backHref: string;
  /** Avertissement affiché en tête (campagne ouverte…). */
  readonly notice?: ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [def, setDef] = useState(initial);
  const [saved, setSaved] = useState(() => snapshot(initial));
  const dirty = snapshot(def) !== saved;
  const guard = useLeaveGuard(dirty);

  const [open, setOpen] = useState<Set<string>>(() => new Set(["settings", ...(initial.forms[0] ? [`f:${initial.forms[0].key}`] : [])]));
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const reveal = (id: string) => setOpen((s) => new Set(s).add(id));

  const [invalidCount, setInvalidCount] = useState(0);
  const onInvalid = useCallback((invalid: boolean) => setInvalidCount((c) => Math.max(0, c + (invalid ? 1 : -1))), []);

  const [pending, setPending] = useState<Pending>(null);
  const [previewForm, setPreviewForm] = useState<number | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState<ImportError | null>(null);
  const [busy, setBusy] = useState<"check" | "apply" | null>(null);

  const issues = useMemo(() => validateEditor(def), [def]);
  const byTarget = useMemo(() => issuesByTarget(issues), [issues]);
  const countWhere = (prefix: string) =>
    [...byTarget].filter(([id]) => id === prefix || id.startsWith(`${prefix}:`)).reduce((n, [, l]) => n + l.length, 0);
  const candidates = useMemo(
    () =>
      ruleCandidates(def).map((c) => ({
        code: c.code,
        label: c.label,
        form: c.form,
      })),
    [def],
  );
  const takenIds = useCallback(() => collectIds(def), [def]);
  const blocked = issues.length > 0 || invalidCount > 0;

  const setCampaign = <K extends keyof CampaignDefinition["campaign"]>(key: K, value: CampaignDefinition["campaign"][K] | undefined) =>
    setDef((d) => ({ ...d, campaign: withOptional(d.campaign, key, value) }));

  const setMessage = (kind: MessageKind, text: string | undefined) =>
    setDef((d) => {
      const messages = withOptional(d.campaign.messages ?? {}, kind, text);
      return {
        ...d,
        campaign: withOptional(d.campaign, "messages", Object.keys(messages).length ? messages : undefined),
      };
    });

  async function send(dryRun: boolean) {
    setBusy(dryRun ? "check" : "apply");
    setImportError(null);
    try {
      const res = await fetch("/api/campaigns/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          definition: def,
          dryRun,
          ...(campaignId ? { campaignId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImportError(importErrorFrom(data));
        if (res.status !== 409) setImportPreview(null);
        return;
      }
      const result = data as ImportPreview;
      if (dryRun) return setImportPreview(result);
      setSaved(snapshot(def));
      setSaveOpen(false);
      toast.success(result.campaign.action === "create" ? "Campagne créée" : "Campagne enregistrée");
      const savedId = result.campaignId ?? campaignId;
      router.push(savedId ? paths.collectes.campaign(savedId) : paths.collectes());
      router.refresh();
    } catch {
      setImportError({
        title: "Connexion impossible. Réessayez dans un instant.",
        items: [],
      });
    } finally {
      setBusy(null);
    }
  }

  function startSave() {
    setImportPreview(null);
    setImportError(null);
    setSaveOpen(true);
    void send(true);
  }

  const confirmRemove = (title: string, message: string, run: () => void) => setPending({ title, message, run });

  const pf = previewForm !== null ? def.forms[previewForm] : null;

  return (
    <div className="flex flex-col gap-6 pb-4">
      {notice}

      {/* ── Paramètres généraux ── */}
      <Card>
        <div className="flex items-center gap-2 px-4 py-2">
          <Disclosure id="editor-settings" open={open.has("settings")} onToggle={() => toggle("settings")}>
            <span className="font-display text-[17px] font-semibold leading-6 text-ink">Paramètres généraux</span>
          </Disclosure>
          <IssueCount count={countWhere("campaign")} />
        </div>
        {open.has("settings") && (
          <div id="editor-settings" className="flex flex-col gap-4 border-t border-line px-4 py-4">
            <IssueList issues={byTarget.get("campaign")} />
            <Input
              label="Titre"
              maxLength={150}
              value={def.campaign.title}
              onChange={(e) =>
                setDef((d) => ({
                  ...d,
                  campaign: { ...d.campaign, title: e.target.value },
                }))
              }
            />
            <Textarea
              label="Description (facultative)"
              rows={3}
              maxLength={5000}
              value={def.campaign.description ?? ""}
              onChange={(e) => setCampaign("description", e.target.value)}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Début de période"
                type="date"
                value={def.campaign.periodStart ?? ""}
                onChange={(e) => setCampaign("periodStart", e.target.value)}
              />
              <Input
                label="Fin de période"
                type="date"
                value={def.campaign.periodEnd ?? ""}
                onChange={(e) => setCampaign("periodEnd", e.target.value)}
              />
              <Input
                label="Échéance"
                type="date"
                value={dueDay(def.campaign.dueAt)}
                hint="Fin de journée, heure de Paris"
                onChange={(e) => setCampaign("dueAt", e.target.value)}
              />
            </div>
            <div className="sm:w-72">
              <NumberField
                label="Conservation des fichiers (jours)"
                integer
                value={def.campaign.fileRetentionDays}
                hint={`Après la clôture ; ${FILE_RETENTION_DAYS.default} par défaut (${FILE_RETENTION_DAYS.min} à ${FILE_RETENTION_DAYS.max})`}
                onInvalid={onInvalid}
                onChange={(v) => setCampaign("fileRetentionDays", v)}
              />
            </div>
            <details className="rounded-control border border-line">
              <summary className="flex min-h-11 cursor-pointer items-center px-3 text-[15px] font-semibold text-ink rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                Modèles de messages
              </summary>
              <div className="flex flex-col gap-5 border-t border-line p-3">
                <p className="text-[13px] leading-[18px] text-ink-muted">
                  Variables : {MESSAGE_PLACEHOLDERS.map((p) => `{{${p.key}}}`).join(", ")}. Un modèle non personnalisé suit le texte par
                  défaut.
                </p>
                {MESSAGE_KINDS.map((kind) => {
                  const custom = def.campaign.messages?.[kind];
                  return (
                    <div key={kind} className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[15px] font-semibold text-ink">{MESSAGE_KIND_LABELS[kind]}</span>
                        {custom === undefined ? (
                          <StatusChip tone="neutral">Par défaut</StatusChip>
                        ) : (
                          <Button type="button" variant="ghost" size="sm" onClick={() => setMessage(kind, undefined)}>
                            Rétablir le texte par défaut
                          </Button>
                        )}
                      </div>
                      <Textarea
                        aria-label={MESSAGE_KIND_LABELS[kind]}
                        rows={5}
                        maxLength={MESSAGE_TEMPLATE_MAX_LENGTH}
                        value={custom ?? DEFAULT_MESSAGE_TEMPLATES[kind]}
                        onChange={(e) => setMessage(kind, e.target.value === DEFAULT_MESSAGE_TEMPLATES[kind] ? undefined : e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
            </details>
          </div>
        )}
      </Card>

      {/* ── Questionnaires ── */}
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Questionnaires ({def.forms.length})</h2>
        <IssueList issues={byTarget.get("global")} />
        {def.forms.map((form, fi) => {
          const fid = `f:${form.key}`;
          const formOpen = open.has(fid);
          return (
            <Card key={form.key}>
              <div className="flex flex-wrap items-center gap-1 px-2 py-2 sm:px-4">
                <Disclosure id={`editor-${fid}`} open={formOpen} onToggle={() => toggle(fid)}>
                  <span className="block truncate font-display text-[17px] font-semibold leading-6 text-ink">
                    {form.title || "Questionnaire sans titre"}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
                    {form.sections.length} section
                    {form.sections.length > 1 ? "s" : ""} · {form.sections.reduce((n, s) => n + s.items.length, 0)} question(s)
                    {form.confidential && <StatusChip tone="warning">Confidentiel</StatusChip>}
                  </span>
                </Disclosure>
                <IssueCount
                  count={countWhere(`form:${fi}`) + countWhere(`assignment:${fi}`) + countWhere(`section:${fi}`) + countWhere(`item:${fi}`)}
                />
                <RowActions
                  name={`le questionnaire « ${form.title} »`}
                  index={fi}
                  count={def.forms.length}
                  canRemove={def.forms.length > 1}
                  onMove={(d) => setDef((x) => moveForm(x, fi, d))}
                  onDuplicate={() => setDef((x) => duplicateForm(x, fi))}
                  onRemove={() =>
                    confirmRemove(
                      `Supprimer le questionnaire « ${form.title} » ?`,
                      "Ses sections, questions et destinataires sont retirés de la définition.",
                      () => setDef((x) => removeForm(x, fi)),
                    )
                  }
                >
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPreviewForm(fi)}>
                    <Eye aria-hidden="true" className="size-4" strokeWidth={1.75} />
                    Aperçu
                  </Button>
                </RowActions>
              </div>

              {formOpen && (
                <div id={`editor-${fid}`} className="flex flex-col gap-5 border-t border-line px-3 py-4 sm:px-4">
                  <IssueList issues={byTarget.get(`form:${fi}`)} />
                  <Input
                    label="Titre du questionnaire"
                    maxLength={150}
                    value={form.title}
                    onChange={(e) =>
                      setDef((x) =>
                        updateForm(x, fi, (f) => ({
                          ...f,
                          title: e.target.value,
                        })),
                      )
                    }
                  />
                  <Textarea
                    label="Consignes (facultatives)"
                    rows={3}
                    maxLength={5000}
                    value={form.intro ?? ""}
                    onChange={(e) => setDef((x) => updateForm(x, fi, (f) => withOptional(f, "intro", e.target.value)))}
                  />
                  <CheckField
                    label="Confidentiel"
                    hint="Réservé aux gestionnaires de la campagne et aux répondants de ce questionnaire."
                    checked={form.confidential === true}
                    onChange={(v) => setDef((x) => updateForm(x, fi, (f) => withOptional(f, "confidential", v || undefined)))}
                  />

                  {/* Destinataires */}
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 font-display text-[15px] font-semibold text-ink">
                      Destinataires ({form.assignments.length})
                    </legend>
                    {form.assignments.map((a, ai) => (
                      <div key={a.key} className="flex flex-col gap-2 rounded-control border border-line p-2">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start">
                          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_11rem]">
                            <Input
                              aria-label={`Destinataire ${ai + 1}`}
                              placeholder="Service, pôle, département…"
                              maxLength={150}
                              value={a.label}
                              onChange={(e) =>
                                setDef((x) =>
                                  updateAssignment(x, fi, ai, (y) => ({
                                    ...y,
                                    label: e.target.value,
                                  })),
                                )
                              }
                            />
                            <Input
                              aria-label={`Échéance de ${a.label || `destinataire ${ai + 1}`}`}
                              type="date"
                              value={dueDay(a.dueAt)}
                              hint="Échéance propre (facultative)"
                              onChange={(e) => setDef((x) => updateAssignment(x, fi, ai, (y) => withOptional(y, "dueAt", e.target.value)))}
                            />
                          </div>
                          <RowActions
                            name={`le destinataire « ${a.label} »`}
                            index={ai}
                            count={form.assignments.length}
                            canRemove={form.assignments.length > 1}
                            onMove={(d) => setDef((x) => moveAssignment(x, fi, ai, d))}
                            onRemove={() => setDef((x) => removeAssignment(x, fi, ai))}
                          />
                        </div>
                        <IssueList issues={byTarget.get(targetId({ kind: "assignment", fi, ai }))} />
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="self-start"
                      onClick={() => setDef((x) => addAssignment(x, fi))}
                    >
                      <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
                      Ajouter un destinataire
                    </Button>
                    {campaignId && (
                      <p className="text-[13px] text-ink-muted">Les répondants se gèrent dans l&apos;onglet Répondants de la campagne.</p>
                    )}
                  </fieldset>

                  {/* Sections */}
                  <div className="flex flex-col gap-3">
                    <h3 className="font-display text-[15px] font-semibold text-ink">Sections ({form.sections.length})</h3>
                    {form.sections.map((section, si) => {
                      const sid = `s:${form.key}:${section.key}`;
                      const sectionOpen = open.has(sid);
                      return (
                        <div key={section.key} className="rounded-card border border-line">
                          <div className="flex flex-wrap items-center gap-1 px-2 py-1">
                            <Disclosure id={`editor-${sid}`} open={sectionOpen} onToggle={() => toggle(sid)}>
                              <span className="block truncate text-[15px] font-semibold text-ink">
                                {section.title || "Section sans titre"}
                              </span>
                              <span className="block text-[13px] text-ink-muted">{section.items.length} question{section.items.length > 1 ? "s" : ""}</span>
                            </Disclosure>
                            <IssueCount count={countWhere(`section:${fi}:${si}`) + countWhere(`item:${fi}:${si}`)} />
                            <RowActions
                              name={`la section « ${section.title} »`}
                              index={si}
                              count={form.sections.length}
                              canRemove={form.sections.length > 1}
                              onMove={(d) => setDef((x) => moveSection(x, fi, si, d))}
                              onDuplicate={() => setDef((x) => duplicateSection(x, fi, si))}
                              onRemove={() =>
                                confirmRemove(
                                  `Supprimer la section « ${section.title} » ?`,
                                  "Ses questions sont retirées de la définition.",
                                  () => setDef((x) => removeSection(x, fi, si)),
                                )
                              }
                            />
                          </div>
                          {sectionOpen && (
                            <div id={`editor-${sid}`} className="flex flex-col gap-4 border-t border-line px-2 py-3 sm:px-3">
                              <IssueList issues={byTarget.get(`section:${fi}:${si}`)} />
                              <Input
                                label="Titre de la section"
                                maxLength={150}
                                value={section.title}
                                onChange={(e) =>
                                  setDef((x) =>
                                    updateSection(x, fi, si, (s) => ({
                                      ...s,
                                      title: e.target.value,
                                    })),
                                  )
                                }
                              />
                              <Textarea
                                label="Consignes de la section (facultatives)"
                                rows={2}
                                maxLength={5000}
                                value={section.intro ?? ""}
                                onChange={(e) => setDef((x) => updateSection(x, fi, si, (s) => withOptional(s, "intro", e.target.value)))}
                              />
                              <ul className="flex flex-col gap-2">
                                {section.items.map((item, ii) => (
                                  <ItemRow
                                    key={item.code}
                                    item={item}
                                    index={ii}
                                    count={section.items.length}
                                    open={open.has(`q:${item.code}`)}
                                    onToggle={() => toggle(`q:${item.code}`)}
                                    issues={byTarget.get(`item:${fi}:${si}:${ii}`)}
                                    sections={form.sections.map((s, j) => ({
                                      value: String(j),
                                      label: s.title || `Section ${j + 1}`,
                                    }))}
                                    sectionIndex={si}
                                    takenIds={takenIds}
                                    onInvalid={onInvalid}
                                    onChange={(next) => setDef((x) => updateItem(x, fi, si, ii, () => next))}
                                    onMove={(d) => setDef((x) => moveItem(x, fi, si, ii, d))}
                                    onMoveTo={(to) => {
                                      setDef((x) => moveItemToSection(x, fi, si, ii, to));
                                      reveal(`s:${form.key}:${form.sections[to].key}`);
                                    }}
                                    onDuplicate={() => setDef((x) => duplicateItem(x, fi, si, ii))}
                                    onRemove={() =>
                                      section.items.length > 1 &&
                                      confirmRemove(`Supprimer la question « ${item.label} » ?`, "Elle est retirée de la définition.", () =>
                                        setDef((x) => removeItem(x, fi, si, ii)),
                                      )
                                    }
                                  />
                                ))}
                              </ul>
                              <div className="sm:w-72">
                                <Select
                                  label="Ajouter une question"
                                  hideLabel
                                  value=""
                                  placeholder="Ajouter une question…"
                                  options={ITEM_TYPES.map((t) => ({
                                    value: t,
                                    label: ITEM_TYPE_LABELS[t],
                                  }))}
                                  onChange={(e) => {
                                    const type = e.target.value as ItemType;
                                    if (!type) return;
                                    setDef((x) => {
                                      const next = addItem(x, fi, si, type);
                                      const added = next.forms[fi].sections[si].items.at(-1);
                                      if (added) reveal(`q:${added.code}`);
                                      return next;
                                    });
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="self-start"
                      onClick={() =>
                        setDef((x) => {
                          const next = addSection(x, fi);
                          const added = next.forms[fi].sections.at(-1);
                          if (added) reveal(`s:${form.key}:${added.key}`);
                          return next;
                        })
                      }
                    >
                      <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
                      Ajouter une section
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        <Button
          type="button"
          variant="secondary"
          className="self-start"
          disabled={def.forms.length >= 50}
          onClick={() =>
            setDef((x) => {
              const next = addForm(x);
              const added = next.forms.at(-1);
              if (added) reveal(`f:${added.key}`);
              return next;
            })
          }
        >
          <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Ajouter un questionnaire
        </Button>
      </div>

      {/* ── Contrôles ── */}
      <Card>
        <div className="flex items-center gap-2 px-4 py-2">
          <Disclosure id="editor-rules" open={open.has("rules")} onToggle={() => toggle("rules")}>
            <span className="block font-display text-[17px] font-semibold leading-6 text-ink">
              Contrôles de cohérence ({def.rules?.length ?? 0})
            </span>
            <span className="block text-[13px] text-ink-muted">Alertes pendant la saisie, jamais bloquantes.</span>
          </Disclosure>
          <IssueCount count={countWhere("rule")} />
        </div>
        {open.has("rules") && (
          <div id="editor-rules" className="flex flex-col gap-3 border-t border-line px-3 py-4 sm:px-4">
            {(def.rules ?? []).map((rule, ri) => (
              <div key={rule.key} className="flex flex-col gap-3 rounded-control border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-semibold text-ink">Contrôle {ri + 1}</span>
                  <RowActions
                    name={`le contrôle ${ri + 1}`}
                    index={ri}
                    count={def.rules?.length ?? 0}
                    onMove={(d) =>
                      setDef((x) => ({
                        ...x,
                        rules: move(x.rules ?? [], ri, d),
                      }))
                    }
                    onRemove={() => setDef((x) => removeRule(x, ri))}
                  />
                </div>
                <IssueList issues={byTarget.get(`rule:${ri}`)} />
                <RuleEditor
                  rule={rule}
                  candidates={candidates}
                  onInvalid={onInvalid}
                  onChange={(next) => setDef((x) => updateRule(x, ri, () => next))}
                />
              </div>
            ))}
            {candidates.length === 0 && (
              <p className="text-[13px] text-ink-muted">
                Un contrôle compare des questions numériques ou oui/non : ajoutez-en d&apos;abord.
              </p>
            )}
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => setDef((x) => addRule(x))}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Ajouter un contrôle
            </Button>
          </div>
        )}
      </Card>

      {issues.length > 0 && (
        <Alert tone="danger" title={`${issues.length} erreur${issues.length > 1 ? "s" : ""} à corriger avant d'enregistrer.`}>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] leading-[18px]">
            {issues.slice(0, 30).map((issue, i) => (
              <li key={i} className="break-words">
                <span className="font-semibold">{describeTarget(def, issue.target)}</span> : {issue.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {/* ── Barre d'actions ── */}
      <div
        data-k-bottom-bar
        className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface px-3 py-2 shadow-float md:bottom-4"
      >
        <p aria-live="polite" className="min-w-0 text-[13px] text-ink-muted">
          {issues.length > 0
            ? `${issues.length} erreur${issues.length > 1 ? "s" : ""}`
            : invalidCount > 0
              ? "Saisie illisible à corriger"
              : dirty
                ? "Modifications non enregistrées"
                : campaignId
                  ? "Aucune modification"
                  : "Nouvelle campagne"}
        </p>
        <div className="flex items-center gap-2">
          <Link href={backHref} className={buttonClasses("secondary")}>
            {dirty ? "Annuler" : "Quitter l'éditeur"}
          </Link>
          <Button type="button" disabled={blocked || busy !== null || (!dirty && !!campaignId)} onClick={startSave}>
            Enregistrer
          </Button>
        </div>
      </div>

      {/* ── Aperçu d'un questionnaire ── */}
      <Modal open={pf !== null} onClose={() => setPreviewForm(null)} title={pf ? `Aperçu : ${pf.title}` : "Aperçu"} size="lg">
        {pf && (
          <AssignmentPreview
            campaign={{
              title: def.campaign.title,
              description: def.campaign.description,
              periodStart: def.campaign.periodStart,
              periodEnd: def.campaign.periodEnd,
              dueAt: def.campaign.dueAt,
            }}
            form={{
              key: pf.key,
              title: pf.title,
              confidential: pf.confidential,
              intro: pf.intro,
              sections: pf.sections,
            }}
            assignments={pf.assignments.map((a) => ({
              key: a.key,
              label: a.label,
              dueAt: a.dueAt,
            }))}
            rules={def.rules}
          />
        )}
      </Modal>

      {/* ── Enregistrement : aperçu de l'import puis confirmation ── */}
      <Modal open={saveOpen} onClose={() => busy !== "apply" && setSaveOpen(false)} title="Enregistrer la campagne" size="lg">
        <div className="flex flex-col gap-5">
          {busy === "check" && <p className="text-[15px] text-ink-muted">Vérification…</p>}
          {importError && <ImportErrorAlert error={importError} />}
          {importPreview && <ImportPreviewView preview={importPreview} showRespondents={false} />}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" disabled={busy === "apply"} onClick={() => setSaveOpen(false)}>
              Retour à l&apos;édition
            </Button>
            <Button
              type="button"
              disabled={!importPreview || isPreviewBlocked(importPreview) || busy !== null}
              onClick={() => void send(false)}
            >
              {busy === "apply" ? "Enregistrement…" : importPreview?.campaign.action === "create" ? "Créer la campagne" : "Enregistrer les modifications"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={pending !== null}
        title={pending?.title ?? ""}
        message={pending?.message ?? ""}
        confirmLabel="Supprimer"
        onConfirm={() => {
          pending?.run();
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />

      <ConfirmModal
        open={guard.pendingHref !== null}
        title="Quitter sans enregistrer ?"
        message="Les modifications de la campagne seront perdues."
        confirmLabel="Quitter sans enregistrer"
        onConfirm={guard.leave}
        onCancel={guard.stay}
      />
    </div>
  );
}

/** Ligne d'une question : résumé repliable, actions, réglages dépliés. */
function ItemRow({
  item,
  index,
  count,
  open,
  onToggle,
  issues,
  sections,
  sectionIndex,
  takenIds,
  onInvalid,
  onChange,
  onMove,
  onMoveTo,
  onDuplicate,
  onRemove,
}: {
  readonly item: DefinitionItem;
  readonly index: number;
  readonly count: number;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly issues?: readonly string[];
  readonly sections: { value: string; label: string }[];
  readonly sectionIndex: number;
  readonly takenIds: () => Set<string>;
  readonly onInvalid: (invalid: boolean) => void;
  readonly onChange: (item: DefinitionItem) => void;
  readonly onMove: (delta: number) => void;
  readonly onMoveTo: (section: number) => void;
  readonly onDuplicate: () => void;
  readonly onRemove: () => void;
}) {
  const id = `editor-q-${item.code}`;
  return (
    <li className="rounded-control border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-1 px-2 py-1">
        <Disclosure id={id} open={open} onToggle={onToggle}>
          <span className="block truncate text-[15px] text-ink">
            {item.label || "Question sans libellé"}
            {item.required && <span className="ml-1 text-ink-muted">*</span>}
          </span>
          <span className="block text-[13px] text-ink-muted">{ITEM_TYPE_LABELS[item.type]}</span>
        </Disclosure>
        <IssueCount count={issues?.length ?? 0} />
        <RowActions
          name={`la question « ${item.label} »`}
          index={index}
          count={count}
          canRemove={count > 1}
          onMove={onMove}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
        />
      </div>
      {open && (
        <div id={id} className="flex flex-col gap-4 border-t border-line px-2 py-3 sm:px-3">
          <IssueList issues={issues} />
          <ItemEditor item={item} takenIds={takenIds} onInvalid={onInvalid} onChange={onChange} />
          {sections.length > 1 && (
            <div className="sm:w-72">
              <Select
                label="Déplacer vers la section"
                value={String(sectionIndex)}
                options={sections}
                onChange={(e) => onMoveTo(Number(e.target.value))}
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
}
