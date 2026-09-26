import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  /** Icône Lucide (24px) dans un disque `brand-soft`. Défaut : `Inbox`. */
  readonly icon?: LucideIcon;
  /** Pourquoi c'est vide (« Aucune absence déclarée »). */
  readonly title: ReactNode;
  /** Une ou deux phrases : ce que l'on peut faire. */
  readonly description?: ReactNode;
  /** L'action qui remplit la liste (Button primary/secondary) ou efface les filtres. */
  readonly action?: ReactNode;
  /** `sm` : dans un tableau ou une carte, marges réduites. */
  readonly size?: "sm" | "md";
  readonly className?: string;
}

/**
 * État vide d'une liste ou d'une page (docs/design-system/components/EmptyState.md). Distinguer
 * « rien encore » (inviter à créer) de « rien pour ce filtre » (proposer d'effacer les filtres).
 */
export default function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  size = "md",
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center gap-2 text-center ${size === "sm" ? "px-4 py-8" : "px-6 py-12"} ${className}`}
    >
      <div className="mb-2 grid size-14 place-items-center rounded-full bg-brand-soft text-brand-text">
        <Icon aria-hidden="true" className="size-6" strokeWidth={1.75} />
      </div>
      <p className="font-display text-[17px] font-semibold leading-6 text-balance text-ink">{title}</p>
      {description && <p className="max-w-[360px] text-[15px] leading-[22px] text-ink-muted">{description}</p>}
      {action && <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
