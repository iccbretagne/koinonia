"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, CircleAlert, CircleCheck, Download, Eye, LoaderCircle, Plus, Trash2, Upload } from "lucide-react";
import {
  Alert,
  Button,
  Checkbox,
  ConfirmModal,
  IconButton,
  Input,
  PageHeader,
  Select,
  StatusChip,
  Textarea,
  buttonClasses,
  fieldLabelClasses,
  useToast,
  type StatusTone,
} from "@/components/ui";
import {
  ASSIGNMENT_STATUS_LABELS,
  FILE_ACCEPT,
  FILE_REQUEST_MAX_FILES,
  FILE_REQUEST_STATUSES,
  FILE_REQUEST_STATUS_LABELS,
  GROUP_MAX_ROWS,
  NOTE_MAX_LENGTH,
  QUALIFIER_LABELS,
  TEXT_MAX_LENGTH,
  type AssignmentStatus,
  type DefinitionItem,
  type FileRequestItem,
  type GroupItem,
  type Qualifier,
  type Rule,
  type ScalarItem,
} from "@/modules/campaigns/schemas";
import { allowedQualifiers, completeness, evaluateRules, flattenItems, ruleScope, validateAnswerValue } from "@/modules/campaigns/schemas";
import type { AssignmentView } from "@/modules/campaigns";

/**
 * Saisie d'un questionnaire de collecte (spec 090), avec compte (`/collectes/r/<id>`) ou par lien
 * personnel (`/collecte/<jeton>`) : même composant, seule `apiBase` change. Enregistrement
 * automatique (regroupé, ~800 ms après la dernière modification), validation locale par la même
 * règle que le serveur (`validateAnswerValue`), complétude recalculée à chaque frappe
 * (`completeness`). Les codes servent à enregistrer, jamais à l'affichage.
 *
 * Mode aperçu (`preview`, spec 091 EVOL-03) : même écran, sans aucun appel réseau. La saisie reste
 * locale (validation, complétude, contrôles locaux évalués sur place), le dépôt de fichier et la
 * soumission sont simulés, rien n'est conservé.
 */

/** La vue telle qu'elle traverse la frontière serveur → client (dates en chaînes ISO). */
type Json<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;
export type AssignmentViewData = Json<AssignmentView>;
type FileView = AssignmentViewData["files"][number];
type Alerts = AssignmentViewData["alerts"];

interface Draft {
  value: unknown;
  qualifier: Qualifier;
  note: string | null;
}

type SaveState = "idle" | "saving" | "saved" | "error";

const SAVE_DELAY_MS = 800;
const MAX_PER_REQUEST = 100;
const FILE_MAX_BYTES = 10 * 1024 * 1024;

const STATUS_TONES: Record<AssignmentStatus, StatusTone> = {
  NOT_STARTED: "neutral",
  IN_PROGRESS: "info",
  SUBMITTED: "brand",
  CHANGES_REQUESTED: "warning",
  VALIDATED: "success",
};

const dayFr = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

const dateTimeFr = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

const sizeFr = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;

/** Échéance passée (hors rendu : la règle de pureté refuse `Date.now()` dans un composant). */
const isPast = (iso: string) => new Date(iso).getTime() < Date.now();

const itemDomId = (code: string) => `q-${code}`;

/**
 * Contrôles d'un aperçu : règles dont tous les codes sont dans ce questionnaire (même portée que
 * le serveur), évaluées sur la saisie locale.
 */
function previewAlerts(rules: readonly Rule[], items: readonly DefinitionItem[], drafts: Record<string, Draft>): Alerts {
  const byCode = new Map(items.map((i) => [i.code, "_"]));
  const local = rules.filter((r) => ruleScope(r, byCode) !== "cross");
  return evaluateRules(local, new Map(Object.entries(drafts)));
}

function scrollToItem(code: string) {
  const el = document.getElementById(itemDomId(code));
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.querySelector<HTMLElement>("input, textarea, select, button")?.focus({ preventScroll: true });
}

async function readError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return typeof data.error === "string" ? data.error : "L'opération n'a pas abouti.";
}

// ── Nombres : virgule française, zéro conservé ─────────────────────────────────────────────────

const formatNumber = (v: unknown) => (typeof v === "number" ? String(v).replace(".", ",") : "");

/** « 12,5 » → 12.5 ; vide → null ; illisible → "invalid". Une case vide n'est jamais zéro. */
function parseNumberText(text: string): number | null | "invalid" {
  const t = text.replace(/[\s  ]/g, "").replace(",", ".");
  if (t === "") return null;
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(t)) return "invalid";
  return Number(t);
}

/**
 * Saisie locale illisible d'un champ (nombre mal tapé) : remontée au formulaire, par champ, pour
 * bloquer la soumission tant qu'elle est à l'écran. Fournie par `ItemBlock` pour sa question.
 */
const LocalErrorContext = createContext<((fieldId: string, message: string | null) => void) | null>(null);

/** Erreurs affichées : celles de la validation, plus la première saisie illisible de chaque question. */
function withLocalErrors(base: Record<string, string>, local: ReadonlyMap<string, ReadonlyMap<string, string>>): Record<string, string> {
  const out = { ...base };
  for (const [code, fields] of local) {
    const first = fields.values().next().value;
    if (first) out[code] = first;
  }
  return out;
}

function NumberInput({
  id,
  item,
  value,
  onChange,
  disabled,
  error,
}: {
  readonly id: string;
  readonly item: Extract<ScalarItem, { type: "integer" | "decimal" }>;
  readonly value: unknown;
  readonly onChange: (v: number | null) => void;
  readonly disabled: boolean;
  readonly error?: string;
}) {
  const [text, setText] = useState(() => formatNumber(value));
  const [localError, setLocalError] = useState<string | null>(null);
  const focused = useRef(false);
  const reportLocalError = useContext(LocalErrorContext);

  // Saisie illisible remontée au formulaire (bloque la soumission), retirée dès qu'elle disparaît.
  useEffect(() => {
    if (!reportLocalError || !localError) return;
    reportLocalError(id, localError);
    return () => reportLocalError(id, null);
  }, [id, localError, reportLocalError]);

  // Valeur changée ailleurs (autre répondant, qualificatif « sans objet ») : resynchroniser hors saisie.
  useEffect(() => {
    if (!focused.current) setText(formatNumber(value));
  }, [value]);

  const unit = item.type === "decimal" ? item.unit : undefined;
  const negative = item.min === undefined || item.min < 0;
  return (
    <div className="flex items-start gap-2">
      <div className="w-40 max-w-full">
        <Input
          id={id}
          type="text"
          inputMode={item.type === "integer" && !negative ? "numeric" : "decimal"}
          autoComplete="off"
          value={text}
          disabled={disabled}
          error={localError ?? error}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false;
            if (!localError) setText(formatNumber(value));
          }}
          onChange={(e) => {
            setText(e.target.value);
            const parsed = parseNumberText(e.target.value);
            if (parsed === "invalid") {
              setLocalError(item.type === "integer" ? "Un nombre entier est attendu (ex. 12)" : "Un nombre est attendu (ex. 12,5)");
              return;
            }
            setLocalError(null);
            onChange(parsed);
          }}
        />
      </div>
      {unit && <span className="pt-2.5 text-[15px] text-ink-muted">{unit}</span>}
    </div>
  );
}

// ── Contrôles ──────────────────────────────────────────────────────────────────────────────────

function Option({ children, input, disabled }: { readonly children: ReactNode; readonly input: ReactNode; readonly disabled: boolean }) {
  return (
    <label
      className={`flex min-h-11 items-center gap-3 rounded-control border border-line bg-surface px-3 py-2 text-[15px] leading-[22px] text-ink ${
        disabled ? "opacity-70" : "cursor-pointer hover:border-control-line"
      }`}
    >
      {input}
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

function Radio({
  name,
  checked,
  disabled,
  onChange,
}: {
  readonly name: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onChange: () => void;
}) {
  return <input type="radio" name={name} className="size-5 shrink-0 accent-brand" checked={checked} disabled={disabled} onChange={onChange} />;
}

function FieldTitle({
  htmlFor,
  label,
  required,
  size,
  as = "label",
}: {
  readonly htmlFor?: string;
  readonly label: string;
  readonly required?: boolean;
  readonly size: "question" | "field";
  readonly as?: "label" | "legend";
}) {
  const className =
    size === "question" ? "block text-[15px] font-semibold leading-[22px] text-ink" : fieldLabelClasses;
  const content = (
    <>
      {label}
      {!required && <span className="ml-1 font-normal text-ink-subtle">(facultatif)</span>}
    </>
  );
  if (as === "legend") return <legend className={`${className} mb-2`}>{content}</legend>;
  return (
    <label htmlFor={htmlFor} className={className}>
      {content}
    </label>
  );
}

function Help({ help, examples }: { readonly help?: string; readonly examples?: string }) {
  if (!help && !examples) return null;
  return (
    <div className="flex flex-col gap-1 text-[13px] leading-[18px] text-ink-muted">
      {help && <p className="whitespace-pre-line">{help}</p>}
      {examples && (
        <p>
          <span className="font-semibold">Exemples : </span>
          {examples}
        </p>
      )}
    </div>
  );
}

function ErrorText({ error }: { readonly error?: string }) {
  if (!error) return null;
  return (
    <p className="flex items-start gap-1 text-[13px] leading-[18px] text-danger">
      <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={1.75} />
      <span>{error}</span>
    </p>
  );
}

/** Un champ scalaire complet (titre, aide, contrôle, erreur) : question de premier niveau ou cellule de groupe. */
function ScalarField({
  id,
  item,
  value,
  onChange,
  disabled,
  error,
  size,
}: {
  readonly id: string;
  readonly item: ScalarItem;
  readonly value: unknown;
  readonly onChange: (v: unknown) => void;
  readonly disabled: boolean;
  readonly error?: string;
  readonly size: "question" | "field";
}) {
  const title = (as: "label" | "legend") => (
    <FieldTitle htmlFor={id} label={item.label} required={item.required} size={size} as={as} />
  );
  const help = <Help help={item.help} examples={item.examples} />;
  const clear =
    !disabled && value !== null && value !== undefined ? (
      <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => onChange(null)}>
        Effacer la réponse
      </Button>
    ) : null;

  switch (item.type) {
    case "integer":
    case "decimal":
      return (
        <div className="flex flex-col gap-1.5">
          {title("label")}
          {help}
          <NumberInput id={id} item={item} value={value} onChange={onChange} disabled={disabled} error={error} />
        </div>
      );
    case "text":
    case "longtext": {
      const text = typeof value === "string" ? value : "";
      const max = item.maxLength ?? TEXT_MAX_LENGTH[item.type];
      return (
        <div className="flex flex-col gap-1.5">
          {title("label")}
          {help}
          {item.type === "text" ? (
            <Input id={id} value={text} maxLength={max} disabled={disabled} error={error} onChange={(e) => onChange(e.target.value)} />
          ) : (
            <Textarea id={id} rows={4} value={text} maxLength={max} disabled={disabled} error={error} onChange={(e) => onChange(e.target.value)} />
          )}
        </div>
      );
    }
    case "date":
      return (
        <div className="flex flex-col gap-1.5">
          {title("label")}
          {help}
          <div className="w-52 max-w-full">
            <Input
              id={id}
              type="date"
              value={typeof value === "string" ? value : ""}
              disabled={disabled}
              error={error}
              onChange={(e) => onChange(e.target.value || null)}
            />
          </div>
        </div>
      );
    case "yesno":
      return (
        <fieldset id={id} className="flex flex-col gap-1.5">
          {title("legend")}
          {help}
          <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
            {[true, false].map((v) => (
              <Option key={String(v)} disabled={disabled} input={<Radio name={id} checked={value === v} disabled={disabled} onChange={() => onChange(v)} />}>
                {v ? "Oui" : "Non"}
              </Option>
            ))}
          </div>
          {clear}
          <ErrorText error={error} />
        </fieldset>
      );
    case "single":
      return (
        <fieldset id={id} className="flex flex-col gap-1.5">
          {title("legend")}
          {help}
          <div className="flex flex-col gap-2">
            {item.choices.map((c) => (
              <Option key={c.key} disabled={disabled} input={<Radio name={id} checked={value === c.key} disabled={disabled} onChange={() => onChange(c.key)} />}>
                {c.label}
              </Option>
            ))}
          </div>
          {clear}
          <ErrorText error={error} />
        </fieldset>
      );
    case "multiple": {
      const picked = Array.isArray(value) ? (value as string[]) : [];
      const exclusive = new Set(item.choices.filter((c) => c.exclusive).map((c) => c.key));
      const toggle = (key: string, on: boolean) => {
        if (!on) return onChange(picked.filter((k) => k !== key));
        // Un choix exclusif (« Aucun ») décoche les autres, et inversement.
        onChange(exclusive.has(key) ? [key] : [...picked.filter((k) => !exclusive.has(k)), key]);
      };
      return (
        <fieldset id={id} className="flex flex-col gap-1.5">
          {title("legend")}
          {help}
          <div className="flex flex-col gap-2">
            {item.choices.map((c) => (
              <Option
                key={c.key}
                disabled={disabled}
                input={<Checkbox checked={picked.includes(c.key)} disabled={disabled} onChange={(e) => toggle(c.key, e.target.checked)} />}
              >
                {c.label}
              </Option>
            ))}
          </div>
          <ErrorText error={error} />
        </fieldset>
      );
    }
  }
}

// ── Groupe répétable ───────────────────────────────────────────────────────────────────────────

function GroupField({
  id,
  item,
  value,
  onChange,
  disabled,
  error,
}: {
  readonly id: string;
  readonly item: GroupItem;
  readonly value: unknown;
  readonly onChange: (v: unknown) => void;
  readonly disabled: boolean;
  readonly error?: string;
}) {
  const v = (value && typeof value === "object" ? value : {}) as { none?: boolean; rows?: Record<string, unknown>[] };
  const none = v.none === true;
  const rows = Array.isArray(v.rows) ? v.rows : [];
  const maxRows = item.maxRows ?? GROUP_MAX_ROWS;
  const emptyRow = () => Object.fromEntries(item.fields.map((f) => [f.code, null]));
  const setRows = (next: Record<string, unknown>[]) => onChange({ rows: next });

  return (
    <fieldset id={id} className="flex flex-col gap-3">
      <FieldTitle label={item.label} required={item.required} size="question" as="legend" />
      <Help help={item.help} examples={item.examples} />
      <Option
        disabled={disabled}
        input={<Checkbox checked={none} disabled={disabled} onChange={(e) => onChange(e.target.checked ? { none: true } : { rows: [] })} />}
      >
        {item.noneLabel ?? "Aucune ligne"}
      </Option>
      {!none && (
        <>
          {rows.map((row, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-control border border-line bg-surface-sunken p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-ink-muted">Ligne {i + 1}</p>
                {!disabled && (
                  <IconButton
                    aria-label={`Supprimer la ligne ${i + 1}`}
                    icon={Trash2}
                    onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  />
                )}
              </div>
              {item.fields.map((field) => (
                <ScalarField
                  key={field.code}
                  id={`${id}-${i}-${field.code}`}
                  item={field}
                  value={row[field.code] ?? null}
                  disabled={disabled}
                  size="field"
                  onChange={(cell) => setRows(rows.map((r, j) => (j === i ? { ...r, [field.code]: cell } : r)))}
                />
              ))}
            </div>
          ))}
          {!disabled && rows.length < maxRows && (
            <Button type="button" variant="secondary" className="self-start" onClick={() => setRows([...rows, emptyRow()])}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Ajouter une ligne
            </Button>
          )}
        </>
      )}
      <ErrorText error={error} />
    </fieldset>
  );
}

// ── Demande de fichier ─────────────────────────────────────────────────────────────────────────

function FileRequestField({
  id,
  item,
  value,
  onChange,
  disabled,
  error,
  files,
  apiBase,
  fileUrl,
  onFilesChange,
  preview,
}: {
  readonly id: string;
  readonly item: FileRequestItem;
  readonly value: unknown;
  readonly onChange: (v: unknown) => void;
  readonly disabled: boolean;
  readonly error?: string;
  readonly files: readonly FileView[];
  readonly apiBase: string;
  readonly fileUrl: (fileId: string) => string;
  readonly onFilesChange: (update: (files: FileView[]) => FileView[]) => void;
  /** Aperçu : dépôt et retrait simulés, rien n'est envoyé. */
  readonly preview?: boolean;
}) {
  const toast = useToast();
  const status = (value as { status?: string } | null)?.status;
  const accept = item.accept ?? FILE_ACCEPT;
  const maxFiles = item.maxFiles ?? FILE_REQUEST_MAX_FILES;
  const [uploading, setUploading] = useState(false);
  const [toDelete, setToDelete] = useState<FileView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const showFiles = status === "FILE_SENT" || files.length > 0;

  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return;
    setUploading(true);
    let count = files.length;
    try {
      for (const file of Array.from(list)) {
        if (count >= maxFiles) {
          toast.error(`${maxFiles} fichier(s) au plus pour cette demande.`);
          break;
        }
        if (file.size > FILE_MAX_BYTES) {
          toast.error(`« ${file.name} » dépasse 10 Mo.`);
          continue;
        }
        if (preview) {
          const simulated: FileView = {
            id: `apercu-${item.code}-${count}-${file.name}`,
            requestCode: item.code,
            name: file.name,
            mime: file.type,
            size: file.size,
            uploadedAt: new Date().toISOString(),
            uploadedByName: null,
          };
          count++;
          onFilesChange((all) => [...all, simulated]);
          continue;
        }
        const body = new FormData();
        body.append("requestCode", item.code);
        body.append("file", file);
        const res = await fetch(`${apiBase}/files`, { method: "POST", body });
        if (!res.ok) {
          toast.error(`« ${file.name} » : ${await readError(res)}`);
          continue;
        }
        const created = (await res.json()) as FileView;
        count++;
        onFilesChange((all) => [...all, created]);
      }
    } catch {
      toast.error("Envoi impossible : vérifiez votre connexion.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(file: FileView) {
    if (preview) {
      onFilesChange((all) => all.filter((f) => f.id !== file.id));
      setToDelete(null);
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(fileUrl(file.id), { method: "DELETE" });
      if (!res.ok) return toast.error(await readError(res));
      onFilesChange((all) => all.filter((f) => f.id !== file.id));
      toast.success("Fichier retiré.");
    } catch {
      toast.error("Suppression impossible : vérifiez votre connexion.");
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  }

  return (
    <fieldset id={id} className="flex flex-col gap-3">
      <FieldTitle label={item.label} required={item.required} size="question" as="legend" />
      <Help help={item.help} examples={item.examples} />
      <div className="flex flex-col gap-2">
        {FILE_REQUEST_STATUSES.map((s) => (
          <Option key={s} disabled={disabled} input={<Radio name={id} checked={status === s} disabled={disabled} onChange={() => onChange({ status: s })} />}>
            {FILE_REQUEST_STATUS_LABELS[s]}
          </Option>
        ))}
      </div>
      {showFiles && (
        <div className="flex flex-col gap-2 rounded-control border border-line bg-surface-sunken p-3">
          {files.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-2 rounded-control bg-surface px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] text-ink">{f.name}</p>
                    <p className="text-[13px] text-ink-muted">
                      {sizeFr(f.size)} · {dateTimeFr(f.uploadedAt)}
                      {f.uploadedByName ? ` · ${f.uploadedByName}` : ""}
                    </p>
                  </div>
                  {!preview && (
                    <a
                      href={fileUrl(f.id)}
                      download
                      aria-label={`Télécharger ${f.name}`}
                      title="Télécharger"
                      className="inline-grid size-11 shrink-0 place-items-center rounded-control text-ink-muted hover:bg-surface-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      <Download aria-hidden="true" className="size-5" strokeWidth={1.75} />
                    </a>
                  )}
                  {!disabled && <IconButton aria-label={`Retirer ${f.name}`} icon={Trash2} onClick={() => setToDelete(f)} />}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-muted">Aucun fichier déposé.</p>
          )}
          {!disabled && files.length < maxFiles && (
            <label className={`${buttonClasses("secondary", "md")} self-start ${uploading ? "pointer-events-none opacity-45" : "cursor-pointer"}`}>
              <Upload aria-hidden="true" className="size-4" strokeWidth={1.75} />
              {uploading ? "Envoi…" : "Déposer des fichiers"}
              <input
                type="file"
                multiple
                className="sr-only"
                disabled={uploading}
                accept={accept.map((e) => `.${e}`).join(",")}
                onChange={(e) => {
                  const list = e.target.files;
                  void upload(list).then(() => (e.target.value = ""));
                }}
              />
            </label>
          )}
          {preview && <p className="text-[13px] text-ink-muted">Aperçu : les fichiers ne sont pas envoyés.</p>}
          <p className="text-[13px] text-ink-muted">
            {accept.map((e) => e.toUpperCase()).join(", ")} · 10 Mo par fichier · {maxFiles} fichier{maxFiles > 1 ? "s" : ""} au plus
          </p>
        </div>
      )}
      <ErrorText error={error} />
      <ConfirmModal
        open={toDelete !== null}
        title="Retirer ce fichier ?"
        message={toDelete ? `« ${toDelete.name} » sera supprimé de ce questionnaire.` : ""}
        confirmLabel="Retirer le fichier"
        confirming={deleting}
        onConfirm={() => toDelete && void remove(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </fieldset>
  );
}

// ── Question : valeur, qualificatif, précision ─────────────────────────────────────────────────

const NOTE_LABELS: Record<Qualifier, string> = {
  EXACT: "Précision (facultative)",
  ESTIMATE: "Comment avez-vous estimé ? (obligatoire)",
  TO_RESEARCH: "Ce qui reste à rechercher (obligatoire)",
  NOT_APPLICABLE: "Précision (facultative)",
  NSP: "Précision (facultative)",
};

function ItemBlock({
  item,
  draft,
  error,
  disabled,
  onChange,
  onLocalError,
  fileProps,
}: {
  readonly item: DefinitionItem;
  readonly draft: Draft;
  readonly error?: string;
  readonly disabled: boolean;
  readonly onChange: (patch: Partial<Draft>) => void;
  readonly onLocalError: (code: string, fieldId: string, message: string | null) => void;
  readonly fileProps: Pick<Parameters<typeof FileRequestField>[0], "files" | "apiBase" | "fileUrl" | "onFilesChange" | "preview">;
}) {
  const id = itemDomId(item.code);
  const qualifiers = allowedQualifiers(item);
  const [noteOpen, setNoteOpen] = useState(Boolean(draft.note));
  const noValue = draft.qualifier === "NOT_APPLICABLE" || draft.qualifier === "NSP";
  const noteVisible = noteOpen || draft.qualifier !== "EXACT" || Boolean(draft.note);
  const setValue = (value: unknown) => onChange({ value });
  const code = item.code;
  const reportLocalError = useCallback((fieldId: string, message: string | null) => onLocalError(code, fieldId, message), [code, onLocalError]);

  let body: ReactNode;
  if (item.type === "group") {
    body = <GroupField id={id} item={item} value={draft.value} onChange={setValue} disabled={disabled} error={error} />;
  } else if (item.type === "file_request") {
    body = <FileRequestField id={id} item={item} value={draft.value} onChange={setValue} disabled={disabled} error={error} {...fileProps} />;
  } else if (noValue) {
    body = (
      <div id={id} className="flex flex-col gap-1.5">
        <FieldTitle label={item.label} required={item.required} size="question" as="label" />
        <p className="text-[15px] text-ink-muted">Pas de valeur : « {QUALIFIER_LABELS[draft.qualifier]} ».</p>
        <ErrorText error={error} />
      </div>
    );
  }
  // Précision manquante (estimation, à rechercher) : l'erreur va sous la précision, sinon sous la valeur.
  const noteMissing = (draft.qualifier === "ESTIMATE" || draft.qualifier === "TO_RESEARCH") && !draft.note?.trim();
  const noteError = noteMissing ? error : undefined;
  if (body === undefined) {
    body = (
      <ScalarField
        id={id}
        item={item as ScalarItem}
        value={draft.value}
        onChange={setValue}
        disabled={disabled}
        error={noteMissing ? undefined : error}
        size="question"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 border-b border-line py-5 last:border-b-0">
      <LocalErrorContext.Provider value={reportLocalError}>{body}</LocalErrorContext.Provider>
      {qualifiers.length > 1 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-56">
              <Select
                label=""
                aria-label={`Nature de la réponse : ${item.label}`}
                value={draft.qualifier}
                disabled={disabled}
                options={qualifiers.map((q) => ({ value: q, label: QUALIFIER_LABELS[q] }))}
                onChange={(e) => {
                  const qualifier = e.target.value as Qualifier;
                  onChange(qualifier === "NOT_APPLICABLE" || qualifier === "NSP" ? { qualifier, value: null } : { qualifier });
                }}
              />
            </div>
            {!noteVisible && !disabled && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setNoteOpen(true)}>
                Ajouter une précision
              </Button>
            )}
          </div>
          {noteVisible && (
            <Textarea
              label={NOTE_LABELS[draft.qualifier]}
              rows={2}
              maxLength={NOTE_MAX_LENGTH}
              value={draft.note ?? ""}
              disabled={disabled}
              error={noteError}
              onChange={(e) => onChange({ note: e.target.value })}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Formulaire ─────────────────────────────────────────────────────────────────────────────────

function SaveIndicator({
  state,
  onRetry,
  preview,
}: {
  readonly state: SaveState;
  readonly onRetry: () => void;
  readonly preview?: boolean;
}) {
  if (preview) {
    return (
      <div className="flex min-h-11 items-center gap-2 text-[13px] text-ink-muted">
        <Eye aria-hidden="true" className="size-4" strokeWidth={1.75} />
        Aperçu : rien n&apos;est enregistré
      </div>
    );
  }
  return (
    <div aria-live="polite" className="flex min-h-11 items-center gap-2 text-[13px] text-ink-muted">
      {state === "saving" && (
        <>
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.75} />
          Enregistrement…
        </>
      )}
      {state === "saved" && (
        <>
          <CircleCheck aria-hidden="true" className="size-4 text-success" strokeWidth={1.75} />
          Enregistré
        </>
      )}
      {state === "idle" && "Enregistrement automatique"}
      {state === "error" && (
        <>
          <CircleAlert aria-hidden="true" className="size-4 text-danger" strokeWidth={1.75} />
          <span className="text-danger">Erreur d&apos;enregistrement</span>
          <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
            Réessayer
          </Button>
        </>
      )}
    </div>
  );
}

const NO_RULES: readonly Rule[] = [];

export default function AssignmentForm({
  view,
  apiBase,
  backHref,
  preview = false,
  previewRules = NO_RULES,
}: {
  readonly view: AssignmentViewData;
  /** `/api/campaigns/assignments/<id>` (avec compte) ou `/api/campaigns/public/<jeton>` (lien). Ignoré en aperçu. */
  readonly apiBase: string;
  /** Lien retour du gestionnaire vers sa campagne. */
  readonly backHref?: string;
  /** Aperçu (spec 091) : aucun appel réseau, rien n'est conservé. */
  readonly preview?: boolean;
  /** Aperçu : règles de la campagne ; celles locales à ce questionnaire sont évaluées sur place. */
  readonly previewRules?: readonly Rule[];
}) {
  const toast = useToast();
  const isPublic = apiBase.startsWith("/api/campaigns/public/");
  const fileUrl = useCallback(
    (fileId: string) => (isPublic ? `${apiBase}/files/${fileId}` : `/api/campaigns/files/${fileId}`),
    [apiBase, isPublic]
  );

  const sections = view.form.sections;
  const items = useMemo(() => flattenItems(sections), [sections]);
  const index = useMemo(() => new Map(items.map((i) => [i.code, i])), [items]);

  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      Object.entries(view.answers).map(([code, a]) => [code, { value: a.value, qualifier: a.qualifier as Qualifier, note: a.note }])
    )
  );
  const draftsRef = useRef(drafts);
  const [files, setFiles] = useState<FileView[]>(view.files);
  const [alerts, setAlerts] = useState<Alerts>(view.alerts);
  const [status, setStatus] = useState(view.assignment.status as AssignmentStatus);
  const [editable, setEditable] = useState(view.editable);
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const errorsRef = useRef(errors);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Enregistrement automatique : codes modifiés, envoyés groupés, envois en file ──
  const dirty = useRef(new Set<string>());
  /** Dernier envoi en échec (réseau, serveur, refus) : la soumission attend un enregistrement réussi. */
  const saveFailed = useRef(false);
  /** Saisies illisibles à l'écran, par question puis par champ (voir `LocalErrorContext`). */
  const localErrors = useRef(new Map<string, Map<string, string>>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const inFlight = useRef(0);

  const send = useCallback(async () => {
    const codes = [...dirty.current];
    dirty.current.clear();
    if (codes.length === 0) return;

    const found: Record<string, string> = {};
    const payload = codes.flatMap((code) => {
      const item = index.get(code);
      const d = draftsRef.current[code];
      if (!item || !d) return [];
      const check = validateAnswerValue(item, d.value, d.qualifier, d.note);
      if (!check.ok) {
        found[code] = check.error;
        return [];
      }
      return [{ code, value: d.value ?? null, qualifier: d.qualifier, note: d.note?.trim() ? d.note.trim() : null }];
    });
    const nextErrors = { ...errorsRef.current };
    for (const code of codes) delete nextErrors[code];
    errorsRef.current = withLocalErrors({ ...nextErrors, ...found }, localErrors.current);
    setErrors(errorsRef.current);
    if (preview) {
      // Aperçu : rien ne part ; les contrôles locaux sont évalués sur la saisie.
      setAlerts(previewAlerts(previewRules, items, draftsRef.current));
      setSaveState("idle");
      return;
    }
    if (payload.length === 0) {
      // Rien d'envoyable : une valeur refusée localement n'est pas « enregistrée ».
      setSaveState((s) => (s !== "saving" ? s : Object.keys(found).length > 0 ? "idle" : "saved"));
      return;
    }

    setSaveState("saving");
    /** Codes pas encore acceptés par le serveur, à renvoyer si l'envoi s'interrompt. */
    const keepFrom = (start: number) => {
      for (const a of payload.slice(start)) dirty.current.add(a.code);
    };
    let i = 0;
    try {
      for (; i < payload.length; i += MAX_PER_REQUEST) {
        const chunk = payload.slice(i, i + MAX_PER_REQUEST);
        const res = await fetch(`${apiBase}/answers`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: chunk }),
        });
        if (res.status === 409) {
          setEditable(false);
          setLockedMessage(await readError(res));
          saveFailed.current = true;
          setSaveState("error");
          return;
        }
        if (!res.ok) {
          // 400 : refus métier du lot, le renvoyer à l'identique ne changerait rien ; les lots
          // suivants, jamais envoyés, restent à enregistrer. Sinon, tout le reste depuis ce lot.
          keepFrom(res.status === 400 ? i + MAX_PER_REQUEST : i);
          saveFailed.current = true;
          setSaveError(await readError(res));
          setSaveState("error");
          return;
        }
        const data = (await res.json()) as { status: AssignmentStatus; alerts: Alerts };
        setStatus(data.status);
        setAlerts(data.alerts);
      }
      saveFailed.current = false;
      setSaveError(null);
      setSaveState(dirty.current.size > 0 ? "saving" : "saved");
    } catch {
      keepFrom(i);
      saveFailed.current = true;
      setSaveError("Connexion interrompue.");
      setSaveState("error");
    }
  }, [apiBase, index, items, preview, previewRules]);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    inFlight.current++;
    queue.current = queue.current.then(send).finally(() => inFlight.current--);
    return queue.current;
  }, [send]);

  const update = useCallback(
    (code: string, patch: Partial<Draft>) => {
      const current = draftsRef.current[code] ?? { value: null, qualifier: "EXACT" as Qualifier, note: null };
      draftsRef.current = { ...draftsRef.current, [code]: { ...current, ...patch } };
      setDrafts(draftsRef.current);
      dirty.current.add(code);
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush]
  );

  const reportLocalError = useCallback((code: string, fieldId: string, message: string | null) => {
    const fields = localErrors.current.get(code) ?? new Map<string, string>();
    if (message) fields.set(fieldId, message);
    else fields.delete(fieldId);
    if (fields.size > 0) localErrors.current.set(code, fields);
    else localErrors.current.delete(code);
    const base = { ...errorsRef.current };
    // Plus de saisie illisible : l'erreur affichée était la sienne ; la validation suivra l'envoi.
    if (fields.size === 0) delete base[code];
    errorsRef.current = withLocalErrors(base, localErrors.current);
    setErrors(errorsRef.current);
  }, []);

  // Avertir avant de quitter avec un envoi en attente (jamais en aperçu : rien n'est à perdre).
  useEffect(() => {
    if (preview) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current.size > 0 || inFlight.current > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [preview]);

  // ── Complétude locale (même règle que la soumission) ──
  const state = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of files) counts.set(f.requestCode, (counts.get(f.requestCode) ?? 0) + 1);
    return completeness(items, new Map(Object.entries(drafts)), counts);
  }, [items, drafts, files]);
  const missing = useMemo(() => new Set(state.missing), [state.missing]);
  const requiredCount = items.filter((i) => i.required).length;
  const answeredRequired = requiredCount - state.missing.filter((c) => index.get(c)?.required).length;
  const percent = requiredCount === 0 ? 100 : Math.round((answeredRequired / requiredCount) * 100);
  const violated = alerts.filter((a) => a.result === "violated");
  const labelOf = (code: string) => index.get(code)?.label ?? "Question";

  /** Réessayer : tout renvoyer (les réponses déjà enregistrées sont réécrites à l'identique). */
  function retry() {
    for (const code of Object.keys(draftsRef.current)) dirty.current.add(code);
    void flush();
  }

  async function startSubmit() {
    await flush();
    const firstError = items.find((i) => errorsRef.current[i.code] || localErrors.current.has(i.code));
    if (firstError) {
      toast.error("Corrigez les réponses signalées avant de soumettre.");
      return scrollToItem(firstError.code);
    }
    // Réponses pas (encore) enregistrées : soumettre maintenant les laisserait de côté.
    if (dirty.current.size > 0 || saveFailed.current) {
      const message = "Des réponses ne sont pas enregistrées : réessayez l'enregistrement avant de soumettre.";
      setSaveError((current) => current ?? message);
      setSaveState("error");
      toast.error(message);
      return;
    }
    if (state.missing.length > 0) {
      setShowMissing(true);
      setSubmitError(null);
      return scrollToItem(state.missing[0]);
    }
    setConfirmOpen(true);
  }

  async function submit() {
    if (preview) {
      setConfirmOpen(false);
      toast.info("Aperçu : la soumission est simulée, rien n'a été envoyé.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/submit`, { method: "POST" });
      if (res.ok) {
        setStatus("SUBMITTED");
        setEditable(false);
        setConfirmOpen(false);
        toast.success("Questionnaire soumis. Merci !");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const message = await readError(res);
      setConfirmOpen(false);
      if (res.status === 409) {
        setEditable(false);
        setLockedMessage(message);
        return;
      }
      setShowMissing(true);
      setSubmitError(message);
      if (state.missing[0]) scrollToItem(state.missing[0]);
      else toast.error(message);
    } catch {
      toast.error("Soumission impossible : vérifiez votre connexion.");
    } finally {
      setSubmitting(false);
    }
  }

  const dueAt = view.assignment.dueAt;
  const overdue = editable && dueAt !== null && isPast(dueAt);
  const submittedInfo =
    view.assignment.submittedAt && (status === "SUBMITTED" || status === "VALIDATED")
      ? `Soumis le ${dayFr(view.assignment.submittedAt)}${view.assignment.submittedByName ? ` par ${view.assignment.submittedByName}` : ""}.`
      : status === "SUBMITTED"
        ? "Questionnaire soumis."
        : null;

  let readOnlyNotice: ReactNode = null;
  if (!editable) {
    if (lockedMessage) readOnlyNotice = <Alert tone="info" title="Lecture seule.">{lockedMessage}</Alert>;
    else if (status === "SUBMITTED" || status === "VALIDATED")
      readOnlyNotice = (
        <Alert tone="success" title={status === "VALIDATED" ? "Questionnaire validé." : "Questionnaire soumis."}>
          {submittedInfo} Il n&apos;est plus modifiable.
        </Alert>
      );
    else if (view.campaign.status === "DRAFT")
      readOnlyNotice = <Alert tone="info" title="Campagne en préparation.">Aperçu en lecture seule : la saisie s&apos;ouvrira avec la campagne.</Alert>;
    else readOnlyNotice = <Alert tone="info" title="Campagne clôturée.">La saisie est fermée : vos réponses restent consultables.</Alert>;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      {backHref && (
        <Link href={backHref} className={`${buttonClasses("ghost", "sm")} self-start`}>
          <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Retour à la campagne
        </Link>
      )}

      <PageHeader eyebrow={view.campaign.title} title={view.form.title} description={view.assignment.label}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusChip tone={STATUS_TONES[status] ?? "neutral"}>{ASSIGNMENT_STATUS_LABELS[status] ?? status}</StatusChip>
          {dueAt && (
            <span className={`text-[13px] ${overdue ? "font-semibold text-danger" : "text-ink-muted"}`}>
              {overdue ? "Échéance dépassée : " : "À rendre le "}
              {dayFr(dueAt)}
            </span>
          )}
        </div>
        {requiredCount > 0 && (
          <div className="flex flex-col gap-1.5">
            <div
              role="progressbar"
              aria-label="Réponses obligatoires renseignées"
              aria-valuemin={0}
              aria-valuemax={requiredCount}
              aria-valuenow={answeredRequired}
              className="h-2 overflow-hidden rounded-full bg-surface-sunken"
            >
              <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-[13px] text-ink-muted">
              {answeredRequired} / {requiredCount} réponses obligatoires
              {state.toResearch.length > 0 ? ` · ${state.toResearch.length} à rechercher` : ""}
              {state.estimates.length > 0 ? ` · ${state.estimates.length} estimation${state.estimates.length > 1 ? "s" : ""}` : ""}
            </p>
          </div>
        )}
      </PageHeader>

      {preview && (
        <Alert tone="info" icon={Eye} title="Aperçu : rien n'est enregistré.">
          Le questionnaire tel que le répondant le verra. Essayez la saisie, les fichiers et la soumission : rien n&apos;est conservé.
        </Alert>
      )}

      {status === "CHANGES_REQUESTED" && editable && (
        <Alert tone="warning" title="Correction demandée.">
          <span className="whitespace-pre-line">{view.assignment.reviewReason ?? "Reprenez vos réponses puis soumettez à nouveau."}</span>
        </Alert>
      )}
      {status === "IN_PROGRESS" && view.assignment.reopened && editable && (
        <Alert tone="warning" title="Questionnaire rouvert : à soumettre de nouveau.">
          <span className="whitespace-pre-line">
            {view.assignment.reviewReason ?? "Vos réponses sont conservées : reprenez-les si besoin puis soumettez à nouveau."}
          </span>
        </Alert>
      )}
      {readOnlyNotice}
      {view.form.intro && <p className="whitespace-pre-line text-[15px] leading-6 text-ink">{view.form.intro}</p>}

      {sections.length > 1 && (
        <nav aria-label="Sommaire" className="rounded-card border border-line bg-surface">
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold text-ink">Sommaire ({sections.length} sections)</summary>
            <ol className="flex flex-col pb-2">
              {sections.map((s, index) => {
                const left = s.items.filter((i) => missing.has(i.code)).length;
                return (
                  <li key={s.key}>
                    <a href={`#section-${index + 1}`} className="flex min-h-11 items-center justify-between gap-3 px-4 text-[15px] text-ink hover:bg-surface-sunken">
                      <span className="min-w-0">{s.title}</span>
                      {left > 0 ? <StatusChip tone="warning">{left} à compléter</StatusChip> : <StatusChip tone="success">Complet</StatusChip>}
                    </a>
                  </li>
                );
              })}
            </ol>
          </details>
        </nav>
      )}

      {violated.length > 0 && (
        <div id="campaign-alerts" className="flex flex-col gap-2">
          {violated.map((a) => (
            <Alert key={a.key} tone="warning" title="À vérifier.">
              {a.message}
            </Alert>
          ))}
        </div>
      )}

      {showMissing && state.missing.length > 0 && (
        <Alert tone="danger" title="Réponses manquantes.">
          {submitError && <span className="block">{submitError}</span>}
          <ul className="mt-1 flex flex-col gap-1">
            {state.missing.map((code) => (
              <li key={code}>
                <button type="button" className="min-h-11 text-left font-semibold underline sm:min-h-0" onClick={() => scrollToItem(code)}>
                  {labelOf(code)}
                </button>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {sections.map((section, index) => (
        <section key={section.key} id={`section-${index + 1}`} className="scroll-mt-20 rounded-card border border-line bg-surface px-4 md:px-6">
          <header className="border-b border-line py-4">
            <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">{section.title}</h2>
            {section.intro && <p className="mt-1 whitespace-pre-line text-[15px] leading-[22px] text-ink-muted">{section.intro}</p>}
          </header>
          {section.items.map((item) => (
            <ItemBlock
              key={item.code}
              item={item}
              draft={drafts[item.code] ?? { value: null, qualifier: "EXACT", note: null }}
              error={errors[item.code] ?? (showMissing && missing.has(item.code) ? "Réponse attendue" : undefined)}
              disabled={!editable}
              onChange={(patch) => update(item.code, patch)}
              onLocalError={reportLocalError}
              fileProps={{ files: files.filter((f) => f.requestCode === item.code), apiBase, fileUrl, onFilesChange: setFiles, preview }}
            />
          ))}
        </section>
      ))}

      {editable && (
        <div
          data-k-bottom-bar
          className={`sticky z-10 flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface px-3 py-2 shadow-sm ${
            isPublic ? "bottom-4" : "bottom-20 md:bottom-4"
          }`}
        >
          <div className="flex min-w-0 flex-col">
            <SaveIndicator state={saveState} onRetry={retry} preview={preview} />
            {saveState === "error" && saveError && <p className="pb-1 text-[13px] text-danger">{saveError}</p>}
            {violated.length > 0 && (
              <a href="#campaign-alerts" className="pb-1 text-[13px] font-semibold text-warning underline">
                {violated.length} alerte{violated.length > 1 ? "s" : ""} de cohérence
              </a>
            )}
          </div>
          <Button type="button" onClick={() => void startSubmit()} disabled={submitting}>
            {submitting ? "Soumission…" : "Soumettre"}
          </Button>
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Soumettre ce questionnaire ?"
        message="Une fois soumis, il passe en lecture seule et les gestionnaires de la campagne sont prévenus."
        confirmLabel="Soumettre"
        confirmingLabel="Soumission…"
        variant="primary"
        confirming={submitting}
        onConfirm={() => void submit()}
        onCancel={() => setConfirmOpen(false)}
      >
        {state.toResearch.length > 0 && (
          <div className="text-[15px] leading-[22px] text-ink">
            <p className="font-semibold">À rechercher ({state.toResearch.length})</p>
            <ul className="mt-1 list-disc pl-5 text-ink-muted">
              {state.toResearch.map((code) => (
                <li key={code}>{labelOf(code)}</li>
              ))}
            </ul>
          </div>
        )}
        {state.estimates.length > 0 && (
          <div className="text-[15px] leading-[22px] text-ink">
            <p className="font-semibold">Estimations ({state.estimates.length})</p>
            <ul className="mt-1 list-disc pl-5 text-ink-muted">
              {state.estimates.map((code) => (
                <li key={code}>{labelOf(code)}</li>
              ))}
            </ul>
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}
