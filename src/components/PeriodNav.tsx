import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Step =
  | { readonly href: string; readonly onClick?: never; readonly disabled?: boolean }
  | { readonly onClick: () => void; readonly href?: never; readonly disabled?: boolean };

const stepClasses =
  "inline-grid size-11 shrink-0 place-items-center rounded-control border border-control-line bg-surface text-ink " +
  "transition-colors duration-120 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45";

function StepControl({ step, label, children }: { readonly step: Step; readonly label: string; readonly children: ReactNode }) {
  if (step.href !== undefined) {
    return (
      <Link
        href={step.href}
        aria-label={label}
        title={label}
        aria-disabled={step.disabled || undefined}
        tabIndex={step.disabled ? -1 : undefined}
        className={stepClasses}
      >
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={step.onClick} disabled={step.disabled} aria-label={label} title={label} className={stepClasses}>
      {children}
    </button>
  );
}

/**
 * Navigation d'une période (mois, semaine) : précédent, libellé, suivant. Les deux pas sont des
 * liens (`href`, page serveur) ou des boutons (`onClick`, composant client). `children` remplace le
 * libellé (ex. champ `month` natif).
 */
export default function PeriodNav({
  label,
  prev,
  next,
  prevLabel = "Période précédente",
  nextLabel = "Période suivante",
  children,
  className = "",
}: {
  readonly label?: ReactNode;
  readonly prev: Step;
  readonly next: Step;
  readonly prevLabel?: string;
  readonly nextLabel?: string;
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <StepControl step={prev} label={prevLabel}>
        <ChevronLeft aria-hidden="true" className="size-5" strokeWidth={1.75} />
      </StepControl>
      <div className="flex min-w-0 flex-1 justify-center">
        {children ?? (
          <h2 className="text-balance text-center font-display text-[15px] font-semibold leading-5 text-ink first-letter:uppercase sm:text-[17px] sm:leading-6">
            {label}
          </h2>
        )}
      </div>
      <StepControl step={next} label={nextLabel}>
        <ChevronRight aria-hidden="true" className="size-5" strokeWidth={1.75} />
      </StepControl>
    </div>
  );
}
