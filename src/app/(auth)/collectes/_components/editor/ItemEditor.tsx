"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Input, Select, Textarea } from "@/components/ui";
import {
  DECIMALS_MAX,
  DEFAULT_QUALIFIERS,
  FILE_ACCEPT,
  FILE_REQUEST_MAX_FILES,
  GROUP_MAX_ROWS,
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  QUALIFIERS,
  QUALIFIER_LABELS,
  SCALAR_ITEM_TYPES,
  TEXT_MAX_LENGTH,
  type DefinitionItem,
  type FileAccept,
  type ItemType,
  type Qualifier,
  type ScalarItem,
} from "@/modules/campaigns/schemas";
import { addChoice, addGroupField, changeItemType, move, withOptional } from "./state";
import { CheckField, Disclosure, NumberField, RowActions } from "./fields";

/**
 * Réglages d'une question (spec 091, EVOL-11) : libellé, type, aide, exemples, obligatoire et
 * options du type. Le code est généré et affiché en lecture seule dans « Avancé ».
 */

type AnyItem = DefinitionItem | ScalarItem;

const typeOptions = (scalarOnly: boolean) =>
  (scalarOnly ? SCALAR_ITEM_TYPES : ITEM_TYPES).map((t) => ({ value: t, label: ITEM_TYPE_LABELS[t] }));

/** Qualificatifs proposés en plus d'« Exacte » (toujours permis). */
const OPTIONAL_QUALIFIERS = QUALIFIERS.filter((q) => q !== "EXACT");

function sameSet(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

export default function ItemEditor<T extends AnyItem>({
  item,
  onChange,
  takenIds,
  scalarOnly = false,
  onInvalid,
}: {
  readonly item: T;
  readonly onChange: (item: T) => void;
  /** Identifiants déjà pris dans le document (nouveaux choix, sous-champs). */
  readonly takenIds: () => Set<string>;
  /** Sous-champ de groupe : ni groupe ni demande de fichier. */
  readonly scalarOnly?: boolean;
  readonly onInvalid: (invalid: boolean) => void;
}) {
  const set = <K extends keyof T>(key: K, value: T[K] | undefined) => onChange(withOptional(item, key, value));
  const any = item as AnyItem;
  const [openField, setOpenField] = useState<string | null>(null);

  const qualified = any.type !== "group" && any.type !== "file_request";
  const qualifiers = qualified ? ((any as { qualifiers?: Qualifier[] }).qualifiers ?? [...DEFAULT_QUALIFIERS]) : [];
  const setQualifiers = (next: Qualifier[]) => {
    const ordered = OPTIONAL_QUALIFIERS.filter((q) => next.includes(q));
    // Retour à la règle par défaut : la clé disparaît (document inchangé).
    const withQ = item as { qualifiers?: Qualifier[] };
    onChange(withOptional(withQ, "qualifiers", sameSet(ordered, DEFAULT_QUALIFIERS) ? undefined : ordered) as unknown as T);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
        <Input label="Libellé" value={any.label} maxLength={300} onChange={(e) => onChange({ ...item, label: e.target.value })} />
        <Select
          label="Type"
          value={any.type}
          options={typeOptions(scalarOnly)}
          onChange={(e) => onChange(changeItemType(item, e.target.value as ItemType, takenIds()))}
        />
      </div>
      <Textarea label="Aide (facultative)" rows={2} maxLength={2000} value={any.help ?? ""} onChange={(e) => set("help" as keyof T, e.target.value as T[keyof T])} />
      <Input label="Exemples (facultatifs)" maxLength={2000} value={any.examples ?? ""} onChange={(e) => set("examples" as keyof T, e.target.value as T[keyof T])} />
      <CheckField
        label="Réponse obligatoire"
        checked={any.required === true}
        onChange={(v) => set("required" as keyof T, (v || undefined) as T[keyof T])}
      />

      {(any.type === "integer" || any.type === "decimal") && (
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label="Minimum (facultatif)" integer={any.type === "integer"} value={any.min} onInvalid={onInvalid} onChange={(v) => set("min" as keyof T, v as T[keyof T])} />
          <NumberField label="Maximum (facultatif)" integer={any.type === "integer"} value={any.max} onInvalid={onInvalid} onChange={(v) => set("max" as keyof T, v as T[keyof T])} />
          {any.type === "decimal" && (
            <>
              <Select
                label="Décimales"
                value={any.decimals === undefined ? "" : String(any.decimals)}
                placeholder={`Jusqu'à ${DECIMALS_MAX}`}
                options={Array.from({ length: DECIMALS_MAX + 1 }, (_, i) => ({ value: String(i), label: String(i) }))}
                onChange={(e) => set("decimals" as keyof T, (e.target.value === "" ? undefined : Number(e.target.value)) as T[keyof T])}
              />
              <Input label="Unité (facultative)" maxLength={20} placeholder="€, km, %…" value={any.unit ?? ""} onChange={(e) => set("unit" as keyof T, e.target.value as T[keyof T])} />
            </>
          )}
        </div>
      )}

      {(any.type === "text" || any.type === "longtext") && (
        <div className="sm:w-64">
          <NumberField
            label="Longueur maximale"
            integer
            value={any.maxLength}
            hint={`${TEXT_MAX_LENGTH[any.type]} caractères au plus, par défaut`}
            onInvalid={onInvalid}
            onChange={(v) => set("maxLength" as keyof T, v as T[keyof T])}
          />
        </div>
      )}

      {(any.type === "single" || any.type === "multiple") && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[13px] font-semibold text-ink">Choix</legend>
          {any.choices.map((c, ci) => (
            <div key={c.key} className="flex flex-col gap-1 rounded-control border border-line bg-surface-sunken p-2 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <Input
                  aria-label={`Choix ${ci + 1}`}
                  value={c.label}
                  maxLength={200}
                  onChange={(e) => onChange({ ...item, choices: any.choices.map((x, j) => (j === ci ? { ...x, label: e.target.value } : x)) })}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                {any.type === "multiple" && (
                  <CheckField
                    label="Exclusif"
                    checked={c.exclusive === true}
                    onChange={(v) =>
                      onChange({ ...item, choices: any.choices.map((x, j) => (j === ci ? withOptional(x, "exclusive", v || undefined) : x)) })
                    }
                  />
                )}
                <RowActions
                  name={`le choix « ${c.label} »`}
                  index={ci}
                  count={any.choices.length}
                  canRemove={any.choices.length > 1}
                  onMove={(d) => onChange({ ...item, choices: move(any.choices, ci, d) })}
                  onRemove={() => onChange({ ...item, choices: any.choices.filter((_, j) => j !== ci) })}
                />
              </div>
            </div>
          ))}
          {any.type === "multiple" && (
            <p className="text-[13px] text-ink-muted">Un choix exclusif (« Aucun ») ne peut pas être coché avec un autre.</p>
          )}
          <Button type="button" variant="secondary" size="sm" className="self-start" disabled={any.choices.length >= 100} onClick={() => onChange(addChoice(item, takenIds()))}>
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Ajouter un choix
          </Button>
        </fieldset>
      )}

      {any.type === "group" && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-[13px] font-semibold text-ink">Champs de chaque ligne</legend>
          {any.fields.map((field, fi) => {
            const open = openField === field.code;
            return (
              <div key={field.code} className="rounded-control border border-line bg-surface-sunken p-2">
                <div className="flex flex-wrap items-center gap-1">
                  <Disclosure id={`field-${field.code}`} open={open} onToggle={() => setOpenField(open ? null : field.code)}>
                    <span className="block truncate text-[15px] text-ink">{field.label || "Champ sans libellé"}</span>
                    <span className="block text-[13px] text-ink-muted">{ITEM_TYPE_LABELS[field.type]}</span>
                  </Disclosure>
                  <RowActions
                    name={`le champ « ${field.label} »`}
                    index={fi}
                    count={any.fields.length}
                    canRemove={any.fields.length > 1}
                    onMove={(d) => onChange({ ...item, fields: move(any.fields, fi, d) })}
                    onRemove={() => onChange({ ...item, fields: any.fields.filter((_, j) => j !== fi) })}
                  />
                </div>
                {open && (
                  <div id={`field-${field.code}`} className="mt-2 border-t border-line pt-3">
                    <ItemEditor
                      item={field}
                      scalarOnly
                      takenIds={takenIds}
                      onInvalid={onInvalid}
                      onChange={(next) => onChange({ ...item, fields: any.fields.map((x, j) => (j === fi ? next : x)) })}
                    />
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
            disabled={any.fields.length >= 30}
            onClick={() => onChange(addGroupField(any, takenIds()) as T)}
          >
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Ajouter un champ
          </Button>
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField label="Lignes minimum" integer value={any.minRows} onInvalid={onInvalid} onChange={(v) => set("minRows" as keyof T, v as T[keyof T])} />
            <NumberField
              label="Lignes maximum"
              integer
              value={any.maxRows}
              hint={`${GROUP_MAX_ROWS} par défaut`}
              onInvalid={onInvalid}
              onChange={(v) => set("maxRows" as keyof T, v as T[keyof T])}
            />
            <Input
              label="Libellé « aucune ligne »"
              placeholder="Aucune ligne"
              maxLength={200}
              value={any.noneLabel ?? ""}
              onChange={(e) => set("noneLabel" as keyof T, e.target.value as T[keyof T])}
            />
          </div>
        </fieldset>
      )}

      {any.type === "file_request" && (
        <div className="flex flex-col gap-3">
          <fieldset className="flex flex-col">
            <legend className="text-[13px] font-semibold text-ink">Formats acceptés</legend>
            <div className="flex flex-wrap gap-x-4">
              {FILE_ACCEPT.map((ext) => {
                const accepted = any.accept ?? [...FILE_ACCEPT];
                return (
                  <CheckField
                    key={ext}
                    label={ext.toUpperCase()}
                    checked={accepted.includes(ext)}
                    onChange={(v) => {
                      const next = FILE_ACCEPT.filter((x) => (x === ext ? v : accepted.includes(x))) as FileAccept[];
                      if (next.length === 0) return;
                      set("accept" as keyof T, (next.length === FILE_ACCEPT.length ? undefined : next) as T[keyof T]);
                    }}
                  />
                );
              })}
            </div>
          </fieldset>
          <div className="sm:w-64">
            <NumberField
              label="Nombre de fichiers au plus"
              integer
              value={any.maxFiles}
              hint={`${FILE_REQUEST_MAX_FILES} par défaut`}
              onInvalid={onInvalid}
              onChange={(v) => set("maxFiles" as keyof T, v as T[keyof T])}
            />
          </div>
        </div>
      )}

      {qualified && (
        <fieldset className="flex flex-col">
          <legend className="text-[13px] font-semibold text-ink">Natures de réponse proposées</legend>
          <div className="flex flex-wrap gap-x-4">
            <CheckField label={QUALIFIER_LABELS.EXACT} checked disabled onChange={() => {}} />
            {OPTIONAL_QUALIFIERS.map((q) => (
              <CheckField
                key={q}
                label={QUALIFIER_LABELS[q]}
                checked={qualifiers.includes(q)}
                onChange={(v) => setQualifiers(v ? [...qualifiers, q] : qualifiers.filter((x) => x !== q))}
              />
            ))}
          </div>
        </fieldset>
      )}

      <details className="rounded-control border border-line">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-[15px] font-semibold text-ink">Avancé</summary>
        <div className="flex flex-col gap-3 border-t border-line p-3">
          <Input label="Code (généré)" value={any.code} readOnly hint="Identifiant stable de la question, jamais réutilisé." className="font-mono" />
          <Input
            label="Code de restitution (facultatif)"
            maxLength={40}
            value={any.reportCode ?? ""}
            hint="Code officiel du rapport ; à défaut, le code généré."
            className="font-mono"
            onChange={(e) => set("reportCode" as keyof T, e.target.value.trim() as T[keyof T])}
          />
          <CheckField
            label="Champ interne"
            hint="Hors rapport officiel."
            checked={any.internal === true}
            onChange={(v) => set("internal" as keyof T, (v || undefined) as T[keyof T])}
          />
        </div>
      </details>
    </div>
  );
}
