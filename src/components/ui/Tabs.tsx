"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "./Badge";

export interface TabItem {
  readonly href: string;
  readonly label: ReactNode;
  /** Compteur facultatif en `CountBadge` (ce qui attend). */
  readonly count?: number;
  /** Force l'état actif ; à défaut, déduit du chemin courant. */
  readonly active?: boolean;
  /** N'active l'onglet que sur son chemin exact (pas sur ses sous-pages). */
  readonly exact?: boolean;
}

interface TabsProps {
  readonly tabs: readonly TabItem[];
  /** Nom de la barre d'onglets (« Espace Audio »). */
  readonly ariaLabel: string;
  /** Position collante, fond, marges : laissés à l'appelant (`sticky top-14 z-20 bg-bg`). */
  readonly className?: string;
}

export function isTabActive(tab: TabItem, pathname: string | null): boolean {
  if (tab.active !== undefined) return tab.active;
  if (!pathname) return false;
  if (pathname === tab.href) return true;
  return !tab.exact && pathname.startsWith(`${tab.href}/`);
}

/**
 * Onglets de navigation entre pages sœurs (docs/design-system/components/Tabs.md) : des liens
 * avec `aria-current="page"`, pas des onglets ARIA qui masquent du contenu. Défilement horizontal
 * sans barre visible ; l'onglet actif est ramené dans le champ à l'ouverture.
 */
export default function Tabs({ tabs, ariaLabel, className = "" }: TabsProps) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active) return;
    const overflowLeft = active.offsetLeft < nav.scrollLeft;
    const overflowRight = active.offsetLeft + active.offsetWidth > nav.scrollLeft + nav.clientWidth;
    if (overflowLeft || overflowRight) {
      nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
    }
  }, [pathname]);

  return (
    <nav
      ref={navRef}
      aria-label={ariaLabel}
      className={`flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {tabs.map((tab) => {
        const active = isTabActive(tab, pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 font-display text-sm font-semibold leading-5
              transition-colors duration-120 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
                active ? "border-brand text-brand-text" : "border-transparent text-ink-muted hover:text-ink"
              }`}
          >
            {tab.label}
            {tab.count !== undefined && <Badge count={tab.count} />}
          </Link>
        );
      })}
    </nav>
  );
}
