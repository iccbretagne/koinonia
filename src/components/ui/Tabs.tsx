"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "./Badge";
import { rovingIndex } from "./roving";

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

interface LinkTabsProps {
  readonly tabs: readonly TabItem[];
  /** Nom de la barre d'onglets (« Espace Audio »). */
  readonly ariaLabel: string;
  /** Position collante, fond, marges : laissés à l'appelant (`sticky top-14 z-sticky bg-bg`). */
  readonly className?: string;
  readonly value?: undefined;
}

/** Onglet d'une barre pilotée par l'état de la page (pas d'URL propre). */
export interface StateTabItem<T extends string = string> {
  readonly value: T;
  readonly label: ReactNode;
  readonly count?: number;
  readonly disabled?: boolean;
}

interface StateTabsProps<T extends string> {
  readonly tabs: readonly StateTabItem<T>[];
  readonly ariaLabel: string;
  readonly className?: string;
  /** Onglet actif. */
  readonly value: T;
  readonly onChange: (value: T) => void;
  /**
   * Préfixe des identifiants : onglet `${idBase}-tab-${value}`, panneau `${idBase}-panel`
   * (`TabPanel` avec le même `idBase`).
   */
  readonly idBase: string;
}

type TabsProps<T extends string> = LinkTabsProps | StateTabsProps<T>;

const tabClasses = (active: boolean) =>
  `-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 font-display text-sm font-semibold leading-5
              transition-colors duration-120 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus
              disabled:cursor-not-allowed disabled:opacity-45 ${
                active ? "border-brand text-brand-text" : "cursor-pointer border-transparent text-ink-muted hover:text-ink"
              }`;

const barClasses =
  "flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** Ramène l'élément actif d'une barre défilante dans le champ. */
function useScrollActiveIntoView(ref: RefObject<HTMLElement | null>, selector: string, dep: unknown) {
  useEffect(() => {
    const bar = ref.current;
    const active = bar?.querySelector<HTMLElement>(selector);
    if (!bar || !active) return;
    const overflowLeft = active.offsetLeft < bar.scrollLeft;
    const overflowRight = active.offsetLeft + active.offsetWidth > bar.scrollLeft + bar.clientWidth;
    if (overflowLeft || overflowRight) {
      bar.scrollLeft = active.offsetLeft - (bar.clientWidth - active.offsetWidth) / 2;
    }
  }, [ref, selector, dep]);
}

/** Identifiants partagés entre `Tabs` (pilotés par état) et `TabPanel`. */
export function tabIds(idBase: string, value: string) {
  return { tab: `${idBase}-tab-${value}`, panel: `${idBase}-panel` };
}

/**
 * Panneau d'onglets pilotés par état : `role="tabpanel"`, relié à l'onglet actif, atteignable au
 * clavier. Un seul panneau dont le contenu suit l'onglet actif.
 */
export function TabPanel({
  idBase,
  value,
  children,
  className = "",
}: {
  readonly idBase: string;
  /** Onglet actif. */
  readonly value: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const ids = tabIds(idBase, value);
  return (
    <div id={ids.panel} role="tabpanel" aria-labelledby={ids.tab} tabIndex={0} className={`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${className}`}>
      {children}
    </div>
  );
}

function StateTabs<T extends string>({ tabs, ariaLabel, className = "", value, onChange, idBase }: StateTabsProps<T>) {
  const barRef = useRef<HTMLDivElement>(null);
  useScrollActiveIntoView(barRef, '[aria-selected="true"]', value);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = rovingIndex(index, e.key, tabs.map((t) => Boolean(t.disabled)));
    if (next === null || next === index) return;
    e.preventDefault();
    onChange(tabs[next].value);
    barRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <div ref={barRef} role="tablist" aria-label={ariaLabel} className={`${barClasses} ${className}`}>
      {tabs.map((tab, i) => {
        const active = tab.value === value;
        const ids = tabIds(idBase, tab.value);
        return (
          <button
            key={tab.value}
            id={ids.tab}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={ids.panel}
            tabIndex={active ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={tabClasses(active)}
          >
            {tab.label}
            {tab.count !== undefined && <Badge count={tab.count} />}
          </button>
        );
      })}
    </div>
  );
}

export function isTabActive(tab: TabItem, pathname: string | null): boolean {
  if (tab.active !== undefined) return tab.active;
  if (!pathname) return false;
  if (pathname === tab.href) return true;
  return !tab.exact && pathname.startsWith(`${tab.href}/`);
}

function LinkTabs({ tabs, ariaLabel, className = "" }: LinkTabsProps) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  useScrollActiveIntoView(navRef, '[aria-current="page"]', pathname);

  return (
    <nav ref={navRef} aria-label={ariaLabel} className={`${barClasses} ${className}`}>
      {tabs.map((tab) => {
        const active = isTabActive(tab, pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={tabClasses(active)}
          >
            {tab.label}
            {tab.count !== undefined && <Badge count={tab.count} />}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Onglets (docs/design-system/components/Tabs.md), deux formes :
 * - **liens** (`tabs` avec `href`) entre pages sœurs : `aria-current="page"`, chaque onglet a son URL ;
 * - **pilotés par état** (`value`, `onChange`, `idBase`) : `role="tablist"`/`tab` reliés à un
 *   `TabPanel`, flèches gauche/droite, Début, Fin, un seul onglet dans l'ordre de tabulation.
 * Défilement horizontal sans barre visible ; l'onglet actif est ramené dans le champ.
 */
export default function Tabs<T extends string = string>(props: TabsProps<T>) {
  if (props.value !== undefined) return <StateTabs {...(props as StateTabsProps<T>)} />;
  return <LinkTabs {...(props as LinkTabsProps)} />;
}
