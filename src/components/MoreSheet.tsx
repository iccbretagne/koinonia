"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { Badge } from "@/components/ui/Badge";
import NavPageList from "@/components/NavPageList";
import { sheetGroup, sheetOverline } from "@/components/nav-styles";
import AccountActions, { type AccountActionsProps } from "@/components/AccountActions";
import { SECTION_LABELS, type ActiveNav, type NavSpace, type SpaceKey } from "@/lib/navigation";

interface MoreSheetProps extends AccountActionsProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly spaces: readonly NavSpace[];
  readonly active: ActiveNav;
}


const rowClass = `flex min-h-15 w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left
  transition-colors duration-120 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus`;

/** Tuile d'icône : ce qui distingue un espace d'une page (les pages n'en ont pas). */
function SpaceTile({ icon: Icon, active, large = false }: { readonly icon: NavSpace["icon"]; readonly active: boolean; readonly large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-control ${large ? "size-10" : "size-9"} ${
        active ? "bg-brand text-on-brand" : "bg-surface text-ink-muted"
      }`}
    >
      <Icon className="size-5" strokeWidth={1.75} />
    </span>
  );
}

/**
 * Un espace s'ouvre en second niveau quand il a plusieurs pages (ou un message d'absence de
 * page) ; sinon sa ligne mène directement à son unique destination.
 */
function directTarget(space: NavSpace): { href: string; external: boolean } | null {
  if (space.emptyMessage || space.pages.length > 1) return null;
  const page = space.pages[0];
  return page ? { href: page.href, external: !!page.external } : { href: space.href, external: !!space.external };
}

function hintFor(space: NavSpace): string | null {
  if (space.pages.length > 1) return `${space.pages.length} pages`;
  const only = space.pages[0];
  return only && only.label !== space.label ? only.label : null;
}

/**
 * Panneau « Plus » de la barre du bas (docs/design-system/components/BottomSheet.md), en deux
 * niveaux. Niveau 1 : les espaces du rôle rangés sous les sections de la sidebar (« Mon service »,
 * « Église »), en listes groupées avec tuile d'icône (l'espace courant en `brand-soft`), puis le
 * compte. Toucher un espace fait glisser vers ses pages, « Menu » ramène à la liste. Un espace à
 * une seule destination y mène directement (flèche au lieu du chevron). Échap remonte d'un niveau
 * avant de fermer.
 */
export default function MoreSheet({ open, onClose, spaces, active, ...account }: MoreSheetProps) {
  const [openedKey, setOpenedKey] = useState<SpaceKey | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef(new Map<SpaceKey, HTMLButtonElement>());
  const returnTo = useRef<SpaceKey | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Hauteur de la liste au moment d'entrer dans un espace : le second niveau la garde au minimum,
  // pour que la feuille ne se rétracte pas sous le doigt.
  const [listHeight, setListHeight] = useState<number | undefined>(undefined);

  // Fermé depuis la coquille (changement de page, passage en desktop) : rouvrir sur la liste.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setOpenedKey(null);
  }

  const opened = spaces.find((s) => s.key === openedKey) ?? null;
  const sections = (["service", "church"] as const)
    .map((section) => ({ section, list: spaces.filter((s) => s.section === section) }))
    .filter(({ list }) => list.length > 0);

  // Focus sur « Espaces » à l'entrée d'un espace, puis sur la ligne quittée au retour.
  useEffect(() => {
    if (!open) return;
    if (opened) {
      backRef.current?.focus();
    } else if (returnTo.current) {
      rowRefs.current.get(returnTo.current)?.focus();
      returnTo.current = null;
    }
  }, [open, opened]);

  const close = onClose;

  function enter(key: SpaceKey) {
    setListHeight(listRef.current?.offsetHeight);
    setOpenedKey(key);
  }

  function back() {
    returnTo.current = openedKey;
    setOpenedKey(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== "Escape" || !opened) return;
    // Empêche le <dialog> de se fermer : Échap remonte d'abord à la liste des espaces.
    e.preventDefault();
    e.stopPropagation();
    back();
  }

  const backButton = (
    <button
      ref={backRef}
      type="button"
      onClick={back}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
      className="-ml-2 inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-control px-2 font-display text-sm font-semibold text-brand-text
        transition-colors duration-120 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
    >
      <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={2} />
      Menu
    </button>
  );

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={opened ? undefined : "Menu"}
      headerStart={opened ? backButton : undefined}
      aria-label="Menu"
    >
      <div onKeyDown={onKeyDown}>
        {opened ? (
          <div
            key={opened.key}
            style={{ minHeight: listHeight }}
            className="transition-[translate,opacity] duration-200 ease-out starting:translate-x-6 starting:opacity-0"
          >
            <div className="mb-1 flex items-center gap-3 border-b border-line px-1 pb-3.5 pt-1">
              <SpaceTile icon={opened.icon} active large />
              <div className="min-w-0">
                <h3 className="truncate font-display text-xl font-bold leading-6 text-ink">{opened.label}</h3>
                {opened.pages.length > 1 && (
                  <p className="text-[13px] leading-[18px] text-ink-subtle">{opened.pages.length} pages</p>
                )}
              </div>
            </div>
            {opened.pages.length === 0 ? (
              <p className="px-3 py-2 text-sm text-ink-subtle">{opened.emptyMessage}</p>
            ) : (
              <NavPageList pages={opened.pages} activePage={active.page} size="touch" onNavigate={close} />
            )}
          </div>
        ) : (
          <div
            ref={listRef}
            className="transition-[translate,opacity] duration-200 ease-out starting:-translate-x-6 starting:opacity-0"
          >
            {sections.map(({ section, list }) => (
              <section key={section} className="mt-4 first:mt-1">
                <p className={sheetOverline}>{SECTION_LABELS[section]}</p>
                <ul className={sheetGroup}>
                  {list.map((s, i) => {
                    const isActive = active.space === s.key;
                    const target = directTarget(s);
                    const hint = hintFor(s);
                    const className = `${rowClass} ${isActive ? "bg-brand-soft" : "text-ink hover:bg-surface"}`;
                    const content = (
                      <>
                        <SpaceTile icon={s.icon} active={isActive} />
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate font-display text-base font-semibold leading-5 ${isActive ? "text-brand-text" : ""}`}
                          >
                            {s.label}
                          </span>
                          {hint && <span className="block truncate text-[13px] leading-[18px] text-ink-subtle">{hint}</span>}
                        </span>
                        {s.badge !== undefined && <Badge count={s.badge} />}
                        {target?.external ? (
                          <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" strokeWidth={1.75} />
                        ) : target ? (
                          <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" strokeWidth={1.75} />
                        ) : (
                          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" strokeWidth={1.75} />
                        )}
                      </>
                    );
                    return (
                      <li key={s.key} className="relative">
                        {/* Filet entre deux espaces, aligné sur le libellé (après la tuile). */}
                        {i > 0 && <span aria-hidden="true" className="absolute left-[60px] right-0 top-0 border-t border-line" />}
                        {!target ? (
                          <button
                            ref={(el) => {
                              if (el) rowRefs.current.set(s.key, el);
                              else rowRefs.current.delete(s.key);
                            }}
                            type="button"
                            onClick={() => enter(s.key)}
                            className={className}
                            aria-current={isActive ? "true" : undefined}
                          >
                            {content}
                          </button>
                        ) : target.external ? (
                          <a href={target.href} target="_blank" rel="noopener noreferrer" className={className} onClick={close}>
                            {content}
                            <span className="sr-only">(nouvel onglet)</span>
                          </a>
                        ) : (
                          <Link
                            href={target.href}
                            aria-current={isActive ? "page" : undefined}
                            className={className}
                            onClick={close}
                          >
                            {content}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

            <section className="mt-4">
              <p className={sheetOverline}>Compte</p>
              <AccountActions {...account} variant="sheet" onNavigate={close} />
            </section>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
