"use client";

import Link from "next/link";
import { ChevronRight, ExternalLink } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { Badge } from "@/components/ui/Badge";
import NavPageList from "@/components/NavPageList";
import AccountActions, { type AccountActionsProps } from "@/components/AccountActions";
import type { ActiveNav, NavSpace } from "@/lib/navigation";

interface MoreSheetProps extends AccountActionsProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly spaces: readonly NavSpace[];
  readonly active: ActiveNav;
}

const overline = "font-display text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-subtle";

/**
 * Panneau « Plus » de la barre du bas (docs/design-system/components/BottomSheet.md) : tous les
 * espaces du rôle en tuiles (4 colonnes, l'espace courant en `brand-soft`), puis leurs pages en
 * liste (l'espace courant déplié), puis le compte. Remplace l'ancien `MobileNavSheet` et ses
 * sous-niveaux avec bouton retour.
 */
export default function MoreSheet({ open, onClose, spaces, active, ...account }: MoreSheetProps) {
  const withPages = spaces.filter((s) => s.pages.length > 0 || s.emptyMessage);

  return (
    <BottomSheet open={open} onClose={onClose} aria-label="Plus">
      <p className={`${overline} mb-2`}>Espaces</p>
      <ul className="grid grid-cols-4 gap-2">
        {spaces.map((s) => {
          const Icon = s.icon;
          const isActive = active.space === s.key;
          const tile = (
            <>
              <span
                className={`relative grid size-12 place-items-center rounded-control ${
                  isActive ? "bg-brand-soft text-brand-text" : "bg-surface-sunken text-ink-muted"
                }`}
              >
                <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
                {s.badge !== undefined && (
                  <span className="absolute -right-1 -top-1">
                    <Badge count={s.badge} className="ring-2 ring-surface" />
                  </span>
                )}
              </span>
              <span className="max-w-full truncate">{s.label}</span>
            </>
          );
          const className = `flex min-w-0 flex-col items-center gap-1.5 rounded-control px-1 py-3 text-center font-sans text-xs font-semibold leading-4 text-ink
            transition-colors duration-120 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus`;
          return (
            <li key={s.key} className="min-w-0">
              {s.external ? (
                <a href={s.href} target="_blank" rel="noopener noreferrer" className={className} onClick={onClose}>
                  {tile}
                  <span className="sr-only">(nouvel onglet)</span>
                </a>
              ) : (
                <Link href={s.href} aria-current={isActive ? "page" : undefined} className={className} onClick={onClose}>
                  {tile}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {withPages.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className={`${overline} mb-1`}>Pages</p>
          <ul className="flex flex-col">
            {withPages.map((s) => {
              const Icon = s.icon;
              const isActive = active.space === s.key;
              return (
                <li key={s.key}>
                  <details open={isActive} className="group">
                    <summary
                      className={`flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-control px-3 font-display text-[15px] font-semibold
                        transition-colors duration-120 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus
                        [&::-webkit-details-marker]:hidden ${isActive ? "text-brand-text" : "text-ink"}`}
                    >
                      <Icon aria-hidden="true" className={`size-5 shrink-0 ${isActive ? "" : "text-ink-subtle"}`} strokeWidth={1.75} />
                      <span className="min-w-0 flex-1 truncate">{s.label}</span>
                      {s.badge !== undefined && <Badge count={s.badge} />}
                      {s.pages.some((p) => p.external) && s.pages.length === 1 && (
                        <ExternalLink aria-hidden="true" className="size-4 text-ink-subtle" strokeWidth={1.75} />
                      )}
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-ink-subtle transition-transform duration-120 group-open:rotate-90"
                        strokeWidth={1.75}
                      />
                    </summary>
                    <div className="mb-1 ml-[22px] border-l border-line pl-2">
                      {s.pages.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-ink-subtle">{s.emptyMessage}</p>
                      ) : (
                        <NavPageList pages={s.pages} activePage={active.page} size="touch" onNavigate={onClose} />
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-3 border-t border-line pt-3">
        <p className={`${overline} mb-1`}>Compte</p>
        <AccountActions {...account} onNavigate={onClose} />
      </div>
    </BottomSheet>
  );
}
