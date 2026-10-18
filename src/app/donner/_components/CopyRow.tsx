"use client";

import { useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { buttonClasses } from "@/components/ui/button-classes";

type CopyState = "idle" | "copied" | "selected";

/**
 * Ligne copiable de la page de dons (spec 065) : la valeur affichée peut différer de la valeur
 * copiée (l'IBAN s'affiche par groupes de 4 et se copie sans espaces). Sans presse-papiers
 * accessible, le texte est sélectionné pour une copie manuelle.
 */
export default function CopyRow({
  label,
  display,
  value,
  mono = false,
}: {
  readonly label: string;
  readonly display: ReactNode;
  readonly value: string;
  readonly mono?: boolean;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const valueRef = useRef<HTMLSpanElement>(null);

  function flash(next: CopyState) {
    setState(next);
    globalThis.setTimeout(() => setState("idle"), 2000);
  }

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        flash("copied");
        return;
      }
    } catch {
      // repli ci-dessous
    }
    const node = valueRef.current;
    const selection = globalThis.getSelection?.();
    if (node && selection) {
      const range = document.createRange();
      range.selectNodeContents(node);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    flash("selected");
  }

  let buttonLabel = "Copier";
  if (state === "copied") buttonLabel = "Copié";
  else if (state === "selected") buttonLabel = "Sélectionné";

  return (
    <div className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-[18px] text-ink-muted">{label}</p>
        <span
          ref={valueRef}
          className={`block break-words text-[15px] font-semibold leading-[22px] text-ink ${mono ? "font-mono tracking-[0.02em]" : ""}`}
        >
          {display}
        </span>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`${buttonLabel} : ${label}`}
        className={`${buttonClasses("secondary", "sm")} shrink-0`}
      >
        {state === "copied" ? <Check aria-hidden="true" className="size-4 text-success" /> : <Copy aria-hidden="true" className="size-4" />}
        <span aria-live="polite">{buttonLabel}</span>
      </button>
    </div>
  );
}
