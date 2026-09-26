"use client";

import type { ReactNode } from "react";
import Checkbox from "./Checkbox";
import { fieldLabelClasses } from "./field-classes";

interface CheckboxGroupProps {
  readonly label: string;
  readonly options: { value: string; label: ReactNode; disabled?: boolean }[];
  readonly selected: string[];
  readonly onChange: (selected: string[]) => void;
}

/**
 * Groupe de cases à cocher dans un `fieldset` (docs/design-system/components/Checkbox.md) :
 * chaque ligne est entièrement cliquable et fait au moins 44px de haut.
 */
export default function CheckboxGroup({
  label,
  options,
  selected,
  onChange,
}: CheckboxGroupProps) {
  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className={`${fieldLabelClasses} mb-1.5`}>{label}</legend>
      <div className="max-h-64 overflow-y-auto overscroll-contain rounded-control border border-control-line bg-surface p-1">
        {options.length === 0 && (
          <p className="px-3 py-2.5 text-[15px] leading-[22px] text-ink-subtle">Aucune option</p>
        )}
        {options.map((opt) => (
          <label
            key={opt.value}
            className={`flex min-h-11 items-start gap-3 rounded-chip px-3 py-2.5 text-[15px] leading-[22px] text-ink ${
              opt.disabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-surface-sunken"
            }`}
          >
            <Checkbox
              className="mt-px"
              checked={selected.includes(opt.value)}
              disabled={opt.disabled}
              onChange={() => toggle(opt.value)}
            />
            <span className={`min-w-0 break-words ${opt.disabled ? "opacity-45" : ""}`}>{opt.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
