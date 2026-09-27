import type { HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info" | "brand" | "accent";

/**
 * Fond `-soft` et texte de la couleur pleine : 4.5:1 dans les deux thèmes. Exporté pour les
 * contrôles qui reprennent la couleur d'un statut sans être une pastille (grille de planning).
 */
export const statusToneClasses: Record<StatusTone, string> = {
  neutral: "bg-surface-sunken text-ink-muted",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  brand: "bg-brand-soft text-brand-text",
  accent: "bg-accent-soft text-ink",
};

interface StatusChipProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: StatusTone;
  /** Icône Lucide facultative, placée avant le mot. */
  readonly icon?: LucideIcon;
  /** Le mot du statut : obligatoire, la couleur seule ne suffit jamais. */
  readonly children: ReactNode;
}

/**
 * Pastille d'état (docs/design-system/components/StatusChip.md) : une couleur sémantique **et**
 * un mot. Correspondances des statuts de service : `SERVICE_STATUS` dans `./status`. `accent`
 * (« Nouveau ») : une seule par écran.
 */
export default function StatusChip({
  tone = "neutral",
  icon: Icon,
  className = "",
  children,
  ...props
}: StatusChipProps) {
  return (
    <span
      className={`inline-flex h-6 max-w-full items-center gap-1 whitespace-nowrap rounded-chip px-2 font-sans text-xs font-semibold leading-4 tracking-[0.01em] ${statusToneClasses[tone]} ${className}`}
      {...props}
    >
      {Icon && <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />}
      <span className="truncate">{children}</span>
    </span>
  );
}
