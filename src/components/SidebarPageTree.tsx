"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { sidebarBlocks, type NavPage, type SidebarEntry, type SidebarMinistry } from "@/lib/navigation";

interface SidebarPageTreeProps {
  readonly pages: readonly NavPage[];
  /** `href` de la page active (voir `resolveActive`). */
  readonly activePage: string | null;
  /**
   * Sous-liste de la sidebar dépliée, reliée à son espace par un filet vertical : la page active
   * y pose un trait `brand`. Sans filet dans le panneau flottant du rail.
   */
  readonly guide?: boolean;
  /** Pose les ancres `data-tour` des pages (une seule instance visible à la fois). */
  readonly withTour?: boolean;
  readonly onNavigate?: () => void;
}

/**
 * Trait de la page active posé sur le filet vertical de la sous-liste : décalé du retrait de la
 * liste (`pl-2.5` + filet), et en plus de celui d'un ministère (`ml-5`).
 */
const GUIDE_MARK = "before:absolute before:inset-y-[7px] before:w-0.5 before:rounded-full before:bg-brand";
const GUIDE_MARK_OFFSET = { root: "before:-left-[11.5px]", ministry: "before:-left-[31.5px]" } as const;

function PageLink({
  entry,
  active,
  mark,
  withTour,
  onNavigate,
}: {
  readonly entry: SidebarEntry;
  readonly active: boolean;
  /** Classes du trait de page active, ou `null` sans filet. */
  readonly mark: string | null;
  readonly withTour: boolean;
  readonly onNavigate?: () => void;
}) {
  const { page, label } = entry;
  const className = `relative flex min-h-9 w-full items-center gap-2 rounded-control px-3 text-left text-sm leading-5 transition-colors duration-120
    focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
      active ? `bg-brand-soft font-semibold text-brand-text ${mark ?? ""}` : "text-ink hover:bg-surface-sunken"
    }`;
  const tour = withTour ? page.dataTour : undefined;

  if (page.external) {
    return (
      <a href={page.href} target="_blank" rel="noopener noreferrer" className={className} data-tour={tour} onClick={onNavigate}>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ExternalLink aria-hidden="true" className="size-3.5 shrink-0 text-ink-subtle" strokeWidth={1.75} />
        <span className="sr-only">(nouvel onglet)</span>
      </a>
    );
  }
  return (
    <Link
      href={page.href}
      aria-current={active ? "page" : undefined}
      title={label === page.label ? undefined : page.label}
      className={className}
      data-tour={tour}
      onClick={onNavigate}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {page.badge !== undefined && <Badge count={page.badge} />}
    </Link>
  );
}

/** Intitulé de bloc : libellé suivi d'un filet — les petites capitales restent aux sections du menu. */
function BlockHeading({ label, count, first }: { readonly label: string; readonly count?: number; readonly first: boolean }) {
  return (
    <li className={`flex items-center gap-2 px-3 pb-1 ${first ? "pt-1" : "pt-3.5"}`}>
      <span className="min-w-0 truncate text-xs font-semibold leading-4 text-ink-subtle">{label}</span>
      {count !== undefined && <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-subtle">{count}</span>}
      <span aria-hidden="true" className="h-px min-w-3 flex-1 bg-line" />
    </li>
  );
}

function Ministry({
  ministry,
  activePage,
  guide,
  withTour,
  onNavigate,
}: {
  readonly ministry: SidebarMinistry;
  readonly activePage: string | null;
  readonly guide: boolean;
  readonly withTour: boolean;
  readonly onNavigate?: () => void;
}) {
  const hasActive = ministry.entries.some((e) => e.page.href === activePage);
  const [openState, setOpenState] = useState<boolean | null>(null);
  // Ouvert s'il contient la page active ; le choix de l'utilisateur prime ensuite.
  const open = openState ?? hasActive;
  const count = ministry.entries.length;

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpenState(!open)}
        aria-expanded={open}
        aria-label={`${ministry.name}, ${count} département${count > 1 ? "s" : ""}`}
        className="flex min-h-8 w-full cursor-pointer items-center gap-1.5 rounded-control pl-2 pr-3 text-left text-[13px] font-semibold leading-5 text-ink-muted
          transition-colors duration-120 hover:bg-surface-sunken hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
      >
        <ChevronDown
          aria-hidden="true"
          className={`size-3.5 shrink-0 text-ink-subtle transition-transform duration-120 ${open ? "" : "-rotate-90"}`}
          strokeWidth={1.75}
        />
        <span className="min-w-0 flex-1 truncate">{ministry.name}</span>
        {!open && hasActive && <span aria-hidden="true" title="Page ouverte" className="size-1.5 shrink-0 rounded-full bg-brand" />}
        <span aria-hidden="true" className="shrink-0 text-xs tabular-nums text-ink-subtle">
          {count}
        </span>
      </button>
      {open && (
        <ul className="ml-5 flex flex-col gap-px">
          {ministry.entries.map((entry) => (
            <li key={entry.page.href}>
              <PageLink
                entry={entry}
                active={entry.page.href === activePage}
                mark={guide ? `${GUIDE_MARK} ${GUIDE_MARK_OFFSET.ministry}` : null}
                withTour={withTour}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Pages d'un espace dans la sidebar desktop (dépliée et panneau flottant du rail), en blocs
 * (`sidebarBlocks`) : intitulé « libellé + filet », ministères repliables, une seule surbrillance
 * pour la page active. Le panneau « Plus » mobile garde `NavPageList`.
 */
export default function SidebarPageTree({ pages, activePage, guide = false, withTour = false, onNavigate }: SidebarPageTreeProps) {
  const blocks = sidebarBlocks(pages);
  const rootMark = guide ? `${GUIDE_MARK} ${GUIDE_MARK_OFFSET.root}` : null;

  return (
    <ul className="flex flex-col gap-px">
      {blocks.map((block, bi) => [
        block.label !== null && (
          <BlockHeading key={`h-${bi}`} label={block.label} count={block.count} first={bi === 0} />
        ),
        ...block.entries.map((entry) => (
          <li key={entry.page.href}>
            <PageLink entry={entry} active={entry.page.href === activePage} mark={rootMark} withTour={withTour} onNavigate={onNavigate} />
          </li>
        )),
        ...block.ministries.map((ministry) => (
          <Ministry
            key={`m-${bi}-${ministry.name}`}
            ministry={ministry}
            activePage={activePage}
            guide={guide}
            withTour={withTour}
            onNavigate={onNavigate}
          />
        )),
      ])}
    </ul>
  );
}
