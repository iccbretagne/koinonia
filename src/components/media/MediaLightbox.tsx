"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export interface LightboxItem {
  id: string;
  src: string | null;
  alt: string;
}

/**
 * Visionneuse plein écran des médias (photos d'événement, galerie — spec 080) : flèches,
 * clavier (← → Échap), balayage tactile. Toujours sombre, quel que soit le thème : les
 * couleurs fixes ci-dessous sont volontaires (cf. docs/design-system/migration.md).
 * Le contenu des barres (statut, actions) est fourni par l'écran appelant.
 */
export default function MediaLightbox<T extends LightboxItem>({
  items,
  initialIndex,
  onClose,
  header,
  footer,
  onIndexChange,
}: {
  readonly items: T[];
  readonly initialIndex: number;
  readonly onClose: () => void;
  /** Partie gauche de la barre du haut (nom, statut…). */
  readonly header: (item: T) => ReactNode;
  /** Barre du bas (actions). */
  readonly footer?: (item: T) => ReactNode;
  /** Prévenu à chaque changement (ex. charger la page suivante en approchant de la fin). */
  readonly onIndexChange?: (index: number) => void;
}) {
  const [index, setIndex] = useState(Math.min(initialIndex, Math.max(items.length - 1, 0)));
  const touchX = useRef<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const safeIndex = Math.min(index, Math.max(items.length - 1, 0));
  const item = items[safeIndex];
  const hasPrev = safeIndex > 0;
  const hasNext = safeIndex < items.length - 1;

  const go = useCallback(
    (dir: 1 | -1) => {
      setIndex((i) => {
        const next = Math.max(0, Math.min(items.length - 1, i + dir));
        if (next !== i) onIndexChange?.(next);
        return next;
      });
    },
    [items.length, onIndexChange]
  );

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [go, onClose]);

  if (!item) return null;

  return (
    <div
      // eslint-disable-next-line no-restricted-syntax -- visionneuse plein écran toujours sombre
      className="fixed inset-0 z-[60] bg-black/95 flex flex-col"
      role="none"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex items-center justify-between px-5 py-3 bg-scrim backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3 min-w-0">{header(item)}</div>
        <div className="flex items-center gap-4 shrink-0 ml-4">
          {/* eslint-disable-next-line no-restricted-syntax -- visionneuse plein écran toujours sombre */}
          <span className="text-sm text-white/50">{safeIndex + 1} / {items.length}</span>
          {/* eslint-disable-next-line no-restricted-syntax -- visionneuse plein écran toujours sombre */}
          <button ref={closeRef} onClick={onClose} aria-label="Fermer" className="text-white/50 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div
        role="none"
        className="flex-1 flex items-center justify-center relative overflow-hidden p-4"
        onTouchStart={(e) => {
          touchX.current = e.touches.length > 0 ? e.touches[0].clientX : null;
        }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          touchX.current = null;
          if (start === null || e.changedTouches.length === 0) return;
          const end = e.changedTouches[0].clientX;
          if (end - start > 50) go(-1);
          else if (start - end > 50) go(1);
        }}
      >
        {hasPrev && (
          <button
            onClick={() => go(-1)}
            aria-label="Précédent"
            // eslint-disable-next-line no-restricted-syntax -- visionneuse plein écran toujours sombre
            className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-scrim hover:bg-black/70 flex items-center justify-center text-white text-xl font-light transition-colors z-10 backdrop-blur-sm"
          >
            ‹
          </button>
        )}
        {item.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={item.id} src={item.src} alt={item.alt} className="max-w-full max-h-full object-contain rounded-xl shadow-overlay select-none" draggable={false} />
        ) : (
          <div className="w-64 h-64 bg-control-line rounded-xl flex items-center justify-center text-ink-muted text-sm">
            Aperçu indisponible
          </div>
        )}
        {hasNext && (
          <button
            onClick={() => go(1)}
            aria-label="Suivant"
            // eslint-disable-next-line no-restricted-syntax -- visionneuse plein écran toujours sombre
            className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-scrim hover:bg-black/70 flex items-center justify-center text-white text-xl font-light transition-colors z-10 backdrop-blur-sm"
          >
            ›
          </button>
        )}
      </div>

      {footer ? (
        <div className="shrink-0 flex flex-wrap items-center justify-center gap-4 py-4 px-5 bg-scrim backdrop-blur-sm">
          {footer(item)}
          {/* eslint-disable-next-line no-restricted-syntax -- visionneuse plein écran toujours sombre */}
          <span className="text-xs text-white/30 hidden sm:block">← → naviguer · Échap fermer</span>
        </div>
      ) : null}
    </div>
  );
}
