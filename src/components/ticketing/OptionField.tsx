"use client";

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
}: {
  readonly option: PublicOption;
  readonly choice: Choice | undefined;
  readonly onChange: (next: Choice | undefined) => void;
}) {
  const price = option.price > 0 ? ` (${formatEuros(option.price)})` : "";
  const soldOut = option.remaining === 0 && !choice;
  if (option.type === "CHOICE") {
    return (
      <Select
        label={`${option.label}${price}`}
        value={choice?.variantId ?? ""}
        disabled={soldOut}
        placeholder={soldOut ? "Épuisé" : "Aucun"}
        hint={option.description ?? undefined}
        options={option.variants.map((v) => ({
          value: v.id,
          label: `${v.label}${v.allergens ? ` — allergènes : ${v.allergens}` : ""}${v.remaining === 0 ? " (épuisé)" : ""}`,
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
