"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import EmptyState from "@/components/ui/EmptyState";
import IconButton from "@/components/ui/IconButton";
import { useViewport } from "@/components/shell-state";

/**
 * Liste et panneau de détail (specs 063 et 064) : sur desktop, colonne de détail collante à
 * droite de la liste ; sur tablette et mobile, feuille depuis le bas de l'écran.
 */
export default function ListDetailLayout({
  list,
  detail,
  detailTitle,
  onClose,
  asideLabel,
  placeholder,
}: {
  readonly list: ReactNode;
  /** Contenu du détail, `null` si rien n'est sélectionné. */
  readonly detail: ReactNode | null;
  readonly detailTitle: string;
  readonly onClose: () => void;
  readonly asideLabel: string;
  /** État vide de la colonne de détail sur desktop. */
  readonly placeholder: { readonly title: string; readonly description: string };
}) {
  const isDesktop = useViewport() === "desktop";
  const open = detail !== null;

  return (
    <>
      <div className={isDesktop ? "grid grid-cols-[minmax(0,1fr)_420px] items-start gap-6" : ""}>
        <div className="flex min-w-0 flex-col gap-4">{list}</div>

        {isDesktop && (
          <aside
            aria-label={asideLabel}
            className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-card border border-line bg-surface"
          >
            {open ? (
              <div className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 break-words font-display text-[17px] font-semibold leading-6 text-ink">{detailTitle}</h2>
                  <IconButton icon={X} aria-label="Fermer" onClick={onClose} />
                </div>
                {detail}
              </div>
            ) : (
              <EmptyState size="sm" title={placeholder.title} description={placeholder.description} />
            )}
          </aside>
        )}
      </div>

      {!isDesktop && (
        <BottomSheet open={open} onClose={onClose} title={detailTitle}>
          <div className="flex flex-col gap-4 px-4 pb-6 pt-2">{detail}</div>
        </BottomSheet>
      )}
    </>
  );
}
