"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { isDestinationActive, type ActiveNav, type BottomDestination } from "@/lib/navigation";

interface BottomNavProps {
  readonly destinations: readonly BottomDestination[];
  readonly active: ActiveNav;
  /** Compteur de « Plus » : ce qui attend dans un espace hors des destinations. */
  readonly moreBadge?: number;
  readonly moreOpen?: boolean;
  readonly onMoreOpen: () => void;
}

const itemClass = `flex h-16 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 font-sans text-[11px] font-semibold leading-4
  transition-colors duration-120 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-focus`;

function Item({ icon: Icon, label, active, badge }: { readonly icon: LucideIcon; readonly label: string; readonly active: boolean; readonly badge?: number }) {
  return (
    <>
      <span
        className={`relative grid h-[30px] w-14 place-items-center rounded-full transition-colors duration-200 ${
          active ? "bg-brand-soft" : ""
        }`}
      >
        <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1 right-2">
            <Badge count={badge} className="ring-2 ring-surface" />
          </span>
        )}
      </span>
      <span className="max-w-full truncate px-1">{label}</span>
    </>
  );
}

/**
 * Barre du bas mobile (docs/design-system/components/BottomNav.md) : jusqu'à quatre destinations
 * adaptées au rôle (`bottomDestinations`), puis « Plus », actif quand la page courante
 * n'appartient à aucune d'elles.
 */
export default function BottomNav({ destinations, active, moreBadge, moreOpen = false, onMoreOpen }: BottomNavProps) {
  const pathname = usePathname();
  const activeKey = destinations.find((d) => isDestinationActive(d, active, pathname))?.key ?? null;
  const moreActive = moreOpen || activeKey === null;
  let moreLabel = "Plus";
  if (moreBadge) {
    const plural = moreBadge > 1 ? "s" : "";
    moreLabel = `Plus, ${moreBadge} nouveauté${plural}`;
  }

  return (
    <nav
      aria-label="Navigation rapide"
      data-tour="bottom-nav"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
    >
      <div className="flex">
        {destinations.map((d) => {
          const isActive = !moreOpen && d.key === activeKey;
          return (
            <Link
              key={d.key}
              href={d.href}
              aria-current={isActive ? "page" : undefined}
              aria-label={d.badge ? `${d.label}, ${d.badge} en attente` : undefined}
              className={`${itemClass} ${isActive ? "text-brand-text" : "text-ink-subtle hover:text-ink"}`}
            >
              <Item icon={d.icon} label={d.label} active={isActive} badge={d.badge} />
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMoreOpen}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-label={moreLabel}
          className={`${itemClass} ${moreActive ? "text-brand-text" : "text-ink-subtle hover:text-ink"}`}
        >
          <Item icon={Ellipsis} label="Plus" active={moreActive} badge={moreBadge} />
        </button>
      </div>
    </nav>
  );
}
