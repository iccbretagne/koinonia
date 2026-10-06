"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ExternalLink, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import ChurchSwitcher from "@/components/ChurchSwitcher";
import SidebarPageTree from "@/components/SidebarPageTree";
import { useSidebarPref, useViewport } from "@/components/shell-state";
import { SECTION_LABELS, type ActiveNav, type NavSpace, type SpaceKey } from "@/lib/navigation";

interface SidebarProps {
  readonly spaces: readonly NavSpace[];
  readonly active: ActiveNav;
  readonly churches: { id: string; name: string }[];
  readonly currentChurchId: string | null;
  readonly churchName: string;
  readonly churchColor: string;
  /** Classes de position collante (bandeau de recette). */
  readonly stickyClassName?: string;
}

const overline = "font-display text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-subtle";

const itemBase = `flex min-h-10 min-w-0 items-center gap-3 rounded-control px-3 font-display text-sm font-semibold leading-5
  transition-colors duration-120 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus`;

function Brand({ compact }: { readonly compact: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${compact ? "justify-center py-4" : "px-3 pb-3 pt-4"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG statique, pas d'optimisation utile */}
      <img src="/brand/icc-plumes.svg" alt="" width={36} height={36} className={compact ? "h-8 w-auto" : "h-9 w-auto"} />
      {!compact && <span className="font-display text-[19px] font-bold leading-6 tracking-[-0.01em] text-ink">Koinonia</span>}
      {compact && <span className="sr-only">Koinonia</span>}
    </div>
  );
}

/* ── Sidebar dépliée (≥ 1024px) ───────────────────────────────────────────── */

/**
 * Un espace s'ouvre sur ses pages quand il en a plusieurs (ou un message d'absence de page) ;
 * sinon sa ligne mène directement à son unique destination — même règle que le panneau « Plus ».
 */
function directTarget(space: NavSpace): { href: string; external: boolean } | null {
  if (space.key === "home") return { href: space.href, external: false };
  if (space.emptyMessage || space.pages.length > 1) return null;
  const page = space.pages[0];
  return page ? { href: page.href, external: !!page.external } : { href: space.href, external: !!space.external };
}

function ExpandedSpace({
  space,
  active,
  open,
  onToggle,
  withTour,
}: {
  readonly space: NavSpace;
  readonly active: ActiveNav;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly withTour: boolean;
}) {
  const isActive = active.space === space.key;
  const Icon = space.icon;
  const target = directTarget(space);
  // Une seule surbrillance : la page active. Un espace ouvert sur ses pages ne fait qu'indiquer le
  // chemin (texte foncé, icône `brand-text`) ; seul un espace à destination unique se remplit.
  let tone = "text-ink-muted hover:bg-surface-sunken hover:text-ink";
  if (isActive && target) tone = "bg-brand-soft text-brand-text";
  else if (isActive) tone = "text-ink hover:bg-surface-sunken";
  const iconTone = isActive ? "text-brand-text" : "text-ink-subtle";
  const className = `${itemBase} w-full ${tone}`;
  const content = (
    <>
      <Icon aria-hidden="true" className={`size-5 shrink-0 ${iconTone}`} strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate">{space.label}</span>
      {!open && space.badge !== undefined && <Badge count={space.badge} />}
    </>
  );

  let trigger: ReactNode;
  if (target?.external) {
    trigger = (
      <a href={target.href} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
        <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" strokeWidth={1.75} />
        <span className="sr-only">(nouvel onglet)</span>
      </a>
    );
  } else if (target) {
    trigger = (
      <Link href={target.href} aria-current={isActive ? "page" : undefined} className={className}>
        {content}
      </Link>
    );
  } else {
    trigger = (
      <button type="button" onClick={onToggle} aria-expanded={open} className={`${className} cursor-pointer text-left`}>
        {content}
        <ChevronDown
          aria-hidden="true"
          className={`size-4 shrink-0 text-ink-subtle transition-transform duration-120 ${open ? "" : "-rotate-90"}`}
          strokeWidth={1.75}
        />
      </button>
    );
  }

  return (
    <li data-tour={withTour ? space.dataTour : undefined}>
      {trigger}
      {open && !target && (
        <div className="mb-2 ml-[21px] mt-0.5 border-l border-line py-0.5 pl-2.5">
          {space.pages.length === 0 ? (
            <p className="px-3 py-2 text-sm text-ink-subtle">{space.emptyMessage}</p>
          ) : (
            <SidebarPageTree pages={space.pages} activePage={active.page} guide withTour={withTour} />
          )}
        </div>
      )}
    </li>
  );
}

function ExpandedNav({
  spaces,
  active,
  withTour,
}: {
  readonly spaces: readonly NavSpace[];
  readonly active: ActiveNav;
  readonly withTour: boolean;
}) {
  // Un seul espace ouvert à la fois : celui de la page active, sauf choix de l'utilisateur
  // (`null` : tout replié). Une nouvelle page rouvre son espace.
  const [chosen, setChosen] = useState<SpaceKey | null | undefined>(undefined);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setChosen(undefined);
  }
  const openKey = chosen === undefined ? active.space : chosen;

  const sections = (["service", "church"] as const).map((section) => ({
    section,
    spaces: spaces.filter((s) => s.section === section),
  }));

  return (
    <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
      {sections
        .filter(({ spaces: list }) => list.length > 0)
        .map(({ section, spaces: list }, si) => (
          <div key={section} className={si > 0 ? "mt-3.5 border-t border-line" : undefined}>
            <p className={`${overline} mx-3 mb-1 mt-4`}>{SECTION_LABELS[section]}</p>
            <ul className="flex flex-col gap-0.5">
              {list.map((s) => {
                const open = openKey === s.key;
                return (
                  <ExpandedSpace
                    key={s.key}
                    space={s}
                    active={active}
                    open={open}
                    onToggle={() => setChosen(open ? null : s.key)}
                    withTour={withTour}
                  />
                );
              })}
            </ul>
          </div>
        ))}
    </nav>
  );
}

/* ── Rail (768–1023px, ou réduit par l'utilisateur) ───────────────────────── */

function RailNav({
  spaces,
  active,
  withTour,
}: {
  readonly spaces: readonly NavSpace[];
  readonly active: ActiveNav;
  readonly withTour: boolean;
}) {
  const [flyout, setFlyout] = useState<{ key: string; top: number; left: number } | null>(null);
  const flyoutRef = useRef<HTMLElement>(null);
  /** Bouton du rail à l'origine du panneau ouvert : reçoit le focus quand Échap le referme. */
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setFlyout(null);
  }

  useEffect(() => {
    if (!flyout) return;
    function onPointer(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (flyoutRef.current?.contains(target) || target.closest("[data-rail-trigger]")) return;
      setFlyout(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setFlyout(null);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [flyout]);

  // À l'ouverture du panneau flottant, le focus clavier doit y entrer (sinon il reste sur le
  // bouton du rail, hors du panneau qui vient d'apparaître à côté).
  useEffect(() => {
    if (!flyout) return;
    const el = flyoutRef.current;
    if (!el) return;
    const firstLink = el.querySelector<HTMLElement>("a, button");
    (firstLink ?? el).focus();
  }, [flyout]);

  const openSpace = flyout ? spaces.find((s) => s.key === flyout.key) : null;

  return (
    <>
      <nav aria-label="Navigation principale" className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto py-2">
        {spaces.map((s) => {
          const Icon = s.icon;
          const isActive = active.space === s.key;
          const direct = s.key === "home" || (s.pages.length <= 1 && !s.emptyMessage && !s.external);
          const tone = isActive
            ? "bg-brand-soft text-brand-text"
            : "text-ink-subtle hover:bg-surface-sunken hover:text-ink";
          const className = `relative grid size-12 shrink-0 place-items-center rounded-control transition-colors duration-120
            focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${tone}`;
          const badge = s.badge !== undefined && (
            <span className="absolute right-0.5 top-0.5">
              <Badge count={s.badge} className="ring-2 ring-surface" />
            </span>
          );
          let label = s.label;
          if (s.badge) {
            const plural = s.badge > 1 ? "s" : "";
            label = `${s.label}, ${s.badge} nouveauté${plural}`;
          }
          return (
            <div key={s.key} data-tour={withTour ? s.dataTour : undefined}>
              {direct ? (
                <Link
                  href={s.href}
                  title={s.label}
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                  className={className}
                >
                  <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
                  {badge}
                </Link>
              ) : (
                <button
                  type="button"
                  data-rail-trigger
                  title={s.label}
                  aria-label={label}
                  aria-expanded={flyout?.key === s.key}
                  aria-current={isActive ? "true" : undefined}
                  onClick={(e) => {
                    triggerRef.current = e.currentTarget;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setFlyout((f) =>
                      f?.key === s.key ? null : { key: s.key, top: Math.max(8, rect.top - 8), left: rect.right + 12 }
                    );
                  }}
                  className={`${className} cursor-pointer`}
                >
                  <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
                  {badge}
                </button>
              )}
            </div>
          );
        })}
      </nav>

      {openSpace && flyout && (
        <section
          ref={flyoutRef}
          aria-label={openSpace.label}
          tabIndex={-1}
          style={{ top: flyout.top, left: flyout.left }}
          className="fixed z-50 flex max-h-[min(32rem,calc(100dvh-16px))] w-64 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-float
            focus:outline-none"
        >
          <p className={`${overline} px-4 pb-1 pt-3`}>{openSpace.label}</p>
          <div className="overflow-y-auto overscroll-contain px-1.5 pb-2">
            {openSpace.pages.length === 0 ? (
              <p className="px-3 py-2 text-sm text-ink-subtle">{openSpace.emptyMessage}</p>
            ) : (
              <SidebarPageTree pages={openSpace.pages} activePage={active.page} onNavigate={() => setFlyout(null)} />
            )}
          </div>
        </section>
      )}
    </>
  );
}

/**
 * Sidebar (docs/design-system/components/Sidebar.md) : dépliée (256px) à partir de 1024px,
 * repliable en rail de 72px (choix mémorisé), rail permanent entre 768 et 1023px, absente sous
 * 768px (barre du bas). Les deux présentations sont dans le DOM, la bonne est affichée en CSS pour
 * éviter un saut au premier rendu ; les ancres de visite guidée ne sont posées que sur celle qui
 * est visible.
 */
export default function Sidebar({
  spaces,
  active,
  churches,
  currentChurchId,
  churchName,
  churchColor,
  stickyClassName = "top-0 h-dvh",
}: SidebarProps) {
  const [pref, setPref] = useSidebarPref();
  const viewport = useViewport();
  const railForced = pref === "rail";
  let visible: "expanded" | "rail" | null = null;
  if (viewport === "desktop") visible = railForced ? "rail" : "expanded";
  else if (viewport === "tablet") visible = "rail";

  const switcher = { churches, currentChurchId, currentName: churchName, color: churchColor };

  return (
    <aside
      aria-label="Menu"
      className={`sticky hidden shrink-0 flex-col border-r border-line bg-surface md:flex print:hidden ${stickyClassName} ${
        railForced ? "w-[72px]" : "w-[72px] lg:w-64"
      }`}
    >
      {/* Présentation dépliée */}
      <div className={`${railForced ? "hidden" : "hidden lg:flex"} min-h-0 flex-1 flex-col`}>
        <Brand compact={false} />
        <div className="px-3">
          <ChurchSwitcher {...switcher} variant="sidebar" />
        </div>
        <ExpandedNav spaces={spaces} active={active} withTour={visible === "expanded"} />
        <div className="border-t border-line p-3">
          <button
            type="button"
            onClick={() => setPref("rail")}
            className={`${itemBase} w-full cursor-pointer text-ink-muted hover:bg-surface-sunken hover:text-ink`}
          >
            <PanelLeftClose aria-hidden="true" className="size-5 text-ink-subtle" strokeWidth={1.75} />
            Réduire le menu
          </button>
        </div>
      </div>

      {/* Rail */}
      <div className={`${railForced ? "flex" : "flex lg:hidden"} min-h-0 flex-1 flex-col items-center`}>
        <Brand compact />
        <ChurchSwitcher {...switcher} variant="rail" />
        <RailNav spaces={spaces} active={active} withTour={visible === "rail"} />
        {railForced && (
          <div className="hidden w-full justify-center border-t border-line py-3 lg:flex">
            <button
              type="button"
              onClick={() => setPref("expanded")}
              title="Déplier le menu"
              aria-label="Déplier le menu"
              className="grid size-12 cursor-pointer place-items-center rounded-control text-ink-subtle transition-colors duration-120 hover:bg-surface-sunken hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
            >
              <PanelLeftOpen aria-hidden="true" className="size-5" strokeWidth={1.75} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
