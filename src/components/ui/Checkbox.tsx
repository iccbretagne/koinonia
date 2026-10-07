"use client";

import { InputHTMLAttributes } from "react";
import { Check, Minus } from "lucide-react";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** État « partiellement coché » (case « tout sélectionner » d'un tableau). */
  readonly indeterminate?: boolean;
}

/**
 * Case à cocher 20px (docs/design-system/components/Checkbox.md) : bordée `control-line`, cochée
 * en aplat `brand` avec coche `on-brand`. Elle ne porte pas de libellé : la placer dans un
 * `<label>` de 44px de haut (voir `CheckboxGroup`) ou lui donner un `aria-label`.
 */
export default function Checkbox({ indeterminate = false, className = "", ...props }: Readonly<CheckboxProps>) {
  return (
    <span className={`relative inline-grid size-5 shrink-0 place-items-center ${className}`}>
      <input
        type="checkbox"
        ref={(el) => {
          if (el) el.indeterminate = indeterminate;
        }}
        className="peer m-0 size-5 cursor-pointer appearance-none rounded-chip border-[1.5px] border-control-line bg-surface
          transition-colors duration-120
          checked:border-brand checked:bg-brand indeterminate:border-brand indeterminate:bg-brand
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus
          disabled:cursor-not-allowed disabled:opacity-45"
        {...props}
      />
      <Check
        aria-hidden="true"
        strokeWidth={3}
        className="pointer-events-none absolute size-3.5 text-on-brand opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-0"
      />
      <Minus
        aria-hidden="true"
        strokeWidth={3}
        className="pointer-events-none absolute size-3.5 text-on-brand opacity-0 peer-indeterminate:opacity-100"
      />
    </span>
  );
}
