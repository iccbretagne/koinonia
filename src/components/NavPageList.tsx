"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { NavPage } from "@/lib/navigation";
import { sheetGroup, sheetOverline } from "@/components/nav-styles";

interface NavPageListProps {
  readonly pages: readonly NavPage[];
  /** `href` de la page active (voir `resolveActive`). */
  readonly activePage: string | null;
  /** `compact` : sous-liste de la sidebar (rangée 36px) ; `touch` : blocs groupés du panneau « Plus » (48px). */
  readonly size?: "compact" | "touch";
  /** Départements groupés par ministère repliables (sidebar dépliée) plutôt qu'à plat. */
  readonly collapsibleGroups?: boolean;
  /** Pose les ancres `data-tour` des pages (une seule instance visible à la fois). */
  readonly withTour?: boolean;
  readonly onNavigate?: () => void;
}

interface Group {
  readonly name: string | null;
  readonly collapsible: boolean;
  readonly pages: NavPage[];
}

function groupPages(pages: readonly NavPage[], collapsible: boolean): Group[] {
  const groups: Group[] = [];
  for (const page of pages) {
    const name = page.group ?? null;
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.pages.push(page);
    else groups.push({ name, collapsible: collapsible && !!page.deptId && !!name, pages: [page] });
  }
  return groups;
}

function PageLink({
  page,
  active,
  size,
  withTour,
  onNavigate,
}: {
  readonly page: NavPage;
  readonly active: boolean;
  readonly size: "compact" | "touch";
  readonly withTour: boolean;
  readonly onNavigate?: () => void;
}) {
  // `touch` : ligne d'un bloc groupé du panneau « Plus » (page active en `brand-soft`, trait à gauche).
  const className =
    size === "touch"
      ? `flex min-h-12 w-full items-center gap-2 px-3.5 text-left text-base transition-colors duration-120
    focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
      active ? "bg-brand-soft font-semibold text-brand-text shadow-[inset_3px_0_0_var(--color-brand)]" : "text-ink hover:bg-surface"
    }`
      : `flex min-h-9 w-full items-center gap-2 rounded-chip px-3 text-left text-sm transition-colors duration-120
    focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
      active ? "font-semibold text-brand-text" : "text-ink-muted hover:bg-surface-sunken hover:text-ink"
    }`;
  const tour = withTour ? page.dataTour : undefined;

  if (page.external) {
    return (
      <a href={page.href} target="_blank" rel="noopener noreferrer" className={className} data-tour={tour} onClick={onNavigate}>
        <span className="min-w-0 flex-1 truncate">{page.label}</span>
        <ExternalLink aria-hidden="true" className="size-3.5 shrink-0 text-ink-subtle" strokeWidth={1.75} />
        <span className="sr-only">(nouvel onglet)</span>
      </a>
    );
  }
  return (
    <Link
      href={page.href}
      aria-current={active ? "page" : undefined}
      className={className}
      data-tour={tour}
      onClick={onNavigate}
    >
      <span className="min-w-0 flex-1 truncate">{page.label}</span>
      {page.badge !== undefined && <Badge count={page.badge} />}
      {size === "touch" && page.badge === undefined && !active && (
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" strokeWidth={1.75} />
      )}
    </Link>
  );
}

function CollapsibleGroup({
  group,
  activePage,
  size,
  withTour,
  defaultOpen,
  onNavigate,
}: {
  readonly group: Group;
  readonly activePage: string | null;
  readonly size: "compact" | "touch";
  readonly withTour: boolean;
  readonly defaultOpen: boolean;
  readonly onNavigate?: () => void;
}) {
  const hasActive = group.pages.some((p) => p.href === activePage);
  const [openState, setOpen] = useState<boolean | null>(null);
  // Ouvert par défaut s'il contient la page active (ou premier groupe à défaut) ; le choix de
  // l'utilisateur prime ensuite.
  const open = openState ?? (hasActive || defaultOpen);

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`flex min-h-9 w-full cursor-pointer items-center gap-1.5 rounded-chip px-3 text-left text-sm transition-colors duration-120
          hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
            hasActive ? "font-semibold text-brand-text" : "font-medium text-ink-muted hover:text-ink"
          }`}
      >
        <ChevronRight
          aria-hidden="true"
          className={`size-3.5 shrink-0 transition-transform duration-120 ${open ? "rotate-90" : ""}`}
          strokeWidth={1.75}
        />
        <span className="min-w-0 flex-1 truncate">{group.name}</span>
      </button>
      {open && (
        <ul className="ml-4">
          {group.pages.map((page) => (
            <li key={page.href}>
              <PageLink page={page} active={page.href === activePage} size={size} withTour={withTour} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Sous-pages d'un espace (sidebar, panneau flottant du rail, panneau « Plus ») : page active en
 * `brand-text` gras, sous-groupes (ministère, « Agenda pastoral ») intitulés. En taille `touch`
 * (panneau « Plus »), chaque sous-groupe devient un bloc groupé.
 */
export default function NavPageList({
  pages,
  activePage,
  size = "compact",
  collapsibleGroups = false,
  withTour = false,
  onNavigate,
}: NavPageListProps) {
  const groups = groupPages(pages, collapsibleGroups);
  const anyActiveGroup = groups.some((g) => g.collapsible && g.pages.some((p) => p.href === activePage));
  const firstCollapsible = groups.findIndex((g) => g.collapsible);

  if (size === "touch") {
    // Panneau « Plus » : un bloc groupé par sous-groupe (ministère…), intitulé au-dessus.
    return (
      <div className="flex flex-col">
        {groups.map((group, gi) => (
          <section key={`${group.name ?? "_"}-${gi}`} className="mt-4">
            {group.name && (
              <p className={`${sheetOverline} flex items-baseline justify-between gap-2`}>
                <span className="min-w-0 truncate">{group.name}</span>
                {group.pages.some((p) => p.deptId) && (
                  <span className="shrink-0 font-semibold normal-case tracking-normal text-ink-subtle">
                    {group.pages.length} département{group.pages.length > 1 ? "s" : ""}
                  </span>
                )}
              </p>
            )}
            <ul className={`${sheetGroup} divide-y divide-line`}>
              {group.pages.map((page) => (
                <li key={page.href}>
                  <PageLink page={page} active={page.href === activePage} size={size} withTour={withTour} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-px">
      {groups.map((group, gi) => {
        if (group.collapsible) {
          return (
            <CollapsibleGroup
              key={`${group.name}-${gi}`}
              group={group}
              activePage={activePage}
              size={size}
              withTour={withTour}
              defaultOpen={!anyActiveGroup && gi === firstCollapsible}
              onNavigate={onNavigate}
            />
          );
        }
        return (
          <li key={`${group.name ?? "_"}-${gi}`}>
            {group.name && (
              <p className="px-3 pb-0.5 pt-2 text-xs font-semibold leading-4 text-ink-subtle">{group.name}</p>
            )}
            <ul className="flex flex-col gap-px">
              {group.pages.map((page) => (
                <li key={page.href}>
                  <PageLink page={page} active={page.href === activePage} size={size} withTour={withTour} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
