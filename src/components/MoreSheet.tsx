"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { Badge } from "@/components/ui/Badge";
import NavPageList from "@/components/NavPageList";
import AccountActions, { type AccountActionsProps } from "@/components/AccountActions";
import type { ActiveNav, NavSpace, SpaceKey } from "@/lib/navigation";

interface MoreSheetProps extends AccountActionsProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly spaces: readonly NavSpace[];
  readonly active: ActiveNav;
}

const overline = "font-display text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-subtle";

const rowClass = `flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-control px-3 py-2 text-left
  transition-colors duration-120 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus`;

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
 * niveaux : la liste des espaces du rôle (l'espace courant en `brand-soft`) suivie du compte ;
 * toucher un espace fait glisser vers ses pages, « Espaces » ramène à la liste. Un espace à une
 * seule destination y mène directement (flèche au lieu du chevron). Échap remonte d'un niveau
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

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape" || !opened) return;
    // Empêche le <dialog> de se fermer : Échap remonte d'abord à la liste des espaces.
    e.preventDefault();
    e.stopPropagation();
    back();
  }

  return (
    <BottomSheet open={open} onClose={close} aria-label="Plus">
      <div onKeyDown={onKeyDown}>
        {opened ? (
          <div
            key={opened.key}
            style={{ minHeight: listHeight }}
            className="transition-[translate,opacity] duration-200 ease-out starting:translate-x-6 starting:opacity-0"
          >
            <button
              ref={backRef}
              type="button"
              onClick={back}
              className="-ml-1 mb-1 inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-control px-2 font-display text-sm font-semibold text-brand-text
                transition-colors duration-120 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
            >
              <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={2} />
              Espaces
            </button>
            <h3 className="flex items-center gap-2.5 px-3 pb-2 font-display text-lg font-semibold leading-6 text-ink">
              <opened.icon aria-hidden="true" className="size-5 shrink-0 text-ink-subtle" strokeWidth={1.75} />
              {opened.label}
            </h3>
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
            <p className={`${overline} mb-1 px-3`}>Espaces</p>
            <ul className="flex flex-col gap-px">
              {spaces.map((s) => {
                const isActive = active.space === s.key;
                const target = directTarget(s);
                const hint = hintFor(s);
                const className = `${rowClass} ${isActive ? "bg-brand-soft text-brand-text" : "text-ink hover:bg-surface-sunken"}`;
                const content = (
                  <>
                    <s.icon
                      aria-hidden="true"
                      className={`size-5 shrink-0 ${isActive ? "" : "text-ink-subtle"}`}
                      strokeWidth={1.75}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[15px] font-semibold leading-5">{s.label}</span>
                      {hint && (
                        <span className={`block truncate text-[13px] leading-[18px] ${isActive ? "" : "text-ink-subtle"}`}>
                          {hint}
                        </span>
                      )}
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
                  <li key={s.key}>
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

            <div className="mt-3 border-t border-line pt-3">
              <p className={`${overline} mb-1 px-3`}>Compte</p>
              <AccountActions {...account} onNavigate={close} />
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
