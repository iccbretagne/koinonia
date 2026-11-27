"use client";

import { useId, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button, Checkbox, Select } from "@/components/ui";
import { formatEuros, type PublicOption } from "@/modules/ticketing/schemas";

export type Choice = { variantId?: string; quantity: number };
export type Choices = Record<string, Choice | undefined>;

export function optionAmount(option: PublicOption, choice: Choice | undefined): number {
  if (!choice) return 0;
  return option.price * (option.type === "QUANTITY" ? choice.quantity : 1);
}

export function toSelections(options: PublicOption[], choices: Choices) {
  return options
    .filter((o) => choices[o.id])
    .map((o) => ({ optionId: o.id, variantId: choices[o.id]?.variantId ?? null, quantity: choices[o.id]?.quantity ?? 1 }));
}

/** Champ d'une option : menu (choix unique), quantité ou case à cocher. */
export default function OptionField({
  option,
  choice,
  onChange,
  label,
}: {
  readonly option: PublicOption;
  readonly choice: Choice | undefined;
  readonly onChange: (next: Choice | undefined) => void;
  /** Libellé du menu à la place de celui de l'option (option déjà nommée par son groupe). */
  readonly label?: string;
}) {
  const price = option.price > 0 ? ` (${formatEuros(option.price)})` : "";
  const soldOut = option.remaining === 0 && !choice;
  if (option.type === "CHOICE") {
    return (
      <Select
        label={label ?? `${option.label}${price}`}
        value={choice?.variantId ?? ""}
        disabled={soldOut}
        placeholder={soldOut ? "Épuisé" : "Aucun"}
        hint={option.description ?? undefined}
        options={option.variants.map((v) => ({
          value: v.id,
          label: [v.label, v.allergens && `— allergènes : ${v.allergens}`, v.remaining === 0 && "(épuisé)"].filter(Boolean).join(" "),
        }))}
        onChange={(e) => onChange(e.target.value ? { variantId: e.target.value, quantity: 1 } : undefined)}
      />
    );
  }
  if (option.type === "QUANTITY") {
    const qty = choice?.quantity ?? 0;
    const set = (n: number) => onChange(n > 0 ? { quantity: n } : undefined);
    return (
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[15px] font-medium text-ink">{option.label}{price}</p>
          {option.description && <p className="text-[13px] text-ink-muted">{option.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" aria-label={`Moins de ${option.label}`} disabled={qty === 0} onClick={() => set(qty - 1)}>
            <Minus className="size-4" aria-hidden="true" />
          </Button>
          <span className="w-6 text-center font-semibold" aria-live="polite">{qty}</span>
          <Button type="button" variant="secondary" size="sm" aria-label={`Plus de ${option.label}`} disabled={soldOut || qty >= 20} onClick={() => set(qty + 1)}>
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    );
  }
  return (
    <label className="flex min-h-11 items-center gap-3">
      <Checkbox checked={!!choice} disabled={soldOut} onChange={(e) => onChange(e.target.checked ? { quantity: 1 } : undefined)} />
      <span className="text-[15px] text-ink">
        {option.label}
        {price}
        {soldOut && " — épuisé"}
      </span>
    </label>
  );
}

type Entry = { kind: "single"; option: PublicOption } | { kind: "group"; name: string; options: PublicOption[] };

/** Options dans l'ordre, celles d'un même groupe réunies à la place de la première. */
function entries(options: PublicOption[]): Entry[] {
  const out: Entry[] = [];
  const groups = new Map<string, PublicOption[]>();
  for (const o of options) {
    if (!o.choiceGroup) {
      out.push({ kind: "single", option: o });
      continue;
    }
    const list = groups.get(o.choiceGroup);
    if (list) list.push(o);
    else {
      const fresh = [o];
      groups.set(o.choiceGroup, fresh);
      out.push({ kind: "group", name: o.choiceGroup, options: fresh });
    }
  }
  return out;
}

/** Groupe au choix unique : un bouton radio par option (« Aucun » compris), puis son détail. */
function ChoiceGroup({
  name,
  options,
  choices,
  onChange,
}: {
  readonly name: string;
  readonly options: PublicOption[];
  readonly choices: Choices;
  readonly onChange: (next: Choices) => void;
}) {
  const radio = useId();
  const picked = options.find((o) => choices[o.id]) ?? null;
  const [focus, setFocus] = useState<string | null>(picked?.id ?? null);
  const current = picked?.id ?? focus;
  function pick(id: string | null) {
    setFocus(id);
    const next: Choices = { ...choices };
    for (const o of options) delete next[o.id];
    const option = options.find((o) => o.id === id);
    // Choisie d'emblée : quantité 1, et pour un menu son premier plat disponible (modifiable).
    if (option?.type === "CHOICE") {
      const first = option.variants.find((v) => v.remaining !== 0);
      if (first) next[option.id] = { variantId: first.id, quantity: 1 };
    } else if (option) next[option.id] = { quantity: 1 };
    onChange(next);
  }
  const detail = options.find((o) => o.id === current && o.type !== "CHECKBOX");
  return (
    <fieldset className="space-y-2">
      <legend className="text-[15px] font-medium text-ink">{name} <span className="font-normal text-ink-muted">(un seul choix)</span></legend>
      {[null, ...options].map((o) => {
        const soldOut = !!o && o.remaining === 0 && !choices[o.id];
        return (
          <label key={o?.id ?? "none"} className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name={radio}
              className="size-5 accent-brand"
              checked={o ? current === o.id : current === null}
              disabled={soldOut}
              onChange={() => pick(o?.id ?? null)}
            />
            <span className="text-[15px] text-ink">
              {o ? o.label : "Aucun"}
              {o && o.price > 0 ? ` (${formatEuros(o.price)})` : ""}
              {soldOut && " — épuisé"}
              {o?.description && <span className="block text-[13px] text-ink-muted">{o.description}</span>}
            </span>
          </label>
        );
      })}
      {detail && (
        <div className="pl-8">
          <OptionField
            option={detail}
            label={detail.type === "CHOICE" ? "Plat" : undefined}
            choice={choices[detail.id]}
            onChange={(c) => onChange({ ...choices, [detail.id]: c })}
          />
        </div>
      )}
    </fieldset>
  );
}

/** Liste des options d'un porteur (participant ou réservation), groupes au choix unique compris. */
export function OptionList({
  options,
  choices,
  onChange,
}: {
  readonly options: PublicOption[];
  readonly choices: Choices;
  readonly onChange: (next: Choices) => void;
}) {
  return (
    <>
      {entries(options).map((e) =>
        e.kind === "single" ? (
          <OptionField key={e.option.id} option={e.option} choice={choices[e.option.id]} onChange={(c) => onChange({ ...choices, [e.option.id]: c })} />
        ) : (
          <ChoiceGroup key={`group-${e.name}`} name={e.name} options={e.options} choices={choices} onChange={onChange} />
        )
      )}
    </>
  );
}
