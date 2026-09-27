"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { CircleCheck, CircleX, Info, X } from "lucide-react";
import { createToastStore, type ToastItem, type ToastOptions, type ToastStore } from "./toast-store";

export interface ToastApi {
  /** Confirmation au participe passé : « Absence enregistrée ». */
  success(message: string, options?: ToastOptions): number;
  /** Ce qui a échoué et comment s'en sortir. */
  error(message: string, options?: ToastOptions): number;
  info(message: string, options?: ToastOptions): number;
  dismiss(id?: number): void;
}

const ToastContext = createContext<ToastApi | null>(null);

function apiFor(store: ToastStore): ToastApi {
  return {
    success: (message, options) => store.show("success", message, options),
    error: (message, options) => store.show("error", message, options),
    info: (message, options) => store.show("info", message, options),
    dismiss: (id) => store.dismiss(id),
  };
}

/** Repli hors fournisseur (rendu isolé, test) : ne jette pas, signale en développement. */
const noopApi: ToastApi = {
  success: warnMissingProvider,
  error: warnMissingProvider,
  info: warnMissingProvider,
  dismiss: () => {},
};

function warnMissingProvider(): number {
  if (process.env.NODE_ENV !== "production") {
    console.warn("useToast() appelé hors de <ToastProvider> : le toast n'est pas affiché.");
  }
  return 0;
}

/**
 * Retour bref après une action (docs/design-system/components/Toast.md).
 *
 * ```tsx
 * const toast = useToast();
 * toast.success("Absence enregistrée", { action: { label: "Annuler", onClick: undo } });
 * toast.error("Enregistrement impossible. Réessayez dans un instant.");
 * ```
 */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? noopApi;
}

/**
 * Monté une fois dans `src/app/layout.tsx`. La région `aria-live="polite"` est toujours présente
 * dans le DOM : un lecteur d'écran n'annonce que ce qui est inséré dans une région déjà existante.
 */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [store] = useState(createToastStore);
  const api = useMemo(() => apiFor(store), [store]);
  const toast = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
  const regionRef = useRef<HTMLDivElement>(null);

  // Couche supérieure (docs/design-system/components/Toast.md) : les modales s'ouvrent avec
  // `<dialog>.showModal()`, qui les place dans la couche supérieure du navigateur, au-dessus de
  // tout élément positionné normalement (même en `position: fixed` + `z-index` élevé) — un toast
  // déclenché pendant qu'une modale est ouverte resterait invisible et inerte derrière elle.
  // `popover="manual"` place cette région dans la même couche ; on la (ré)affiche à chaque
  // nouveau toast, et on la replace au sommet dès qu'une modale s'ouvre ensuite (la dernière
  // couche affichée gagne — voir l'observateur ci-dessous).
  useEffect(() => {
    const el = regionRef.current;
    if (!el || typeof el.showPopover !== "function") return;
    try {
      if (toast) {
        if (el.matches(":popover-open")) el.hidePopover();
        el.showPopover();
      } else if (el.matches(":popover-open")) {
        el.hidePopover();
      }
    } catch {
      // API indisponible ou état inattendu : le toast reste simplement affiché en flux normal
      // (repli couvert par le style ci-dessous, indépendant de l'API Popover).
    }
  }, [toast]);

  useEffect(() => {
    const el = regionRef.current;
    if (!el || typeof el.showPopover !== "function" || typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver((mutations) => {
      const dialogOpened = mutations.some((m) => m.target instanceof HTMLDialogElement && m.target.open);
      if (!dialogOpened || !el.matches(":popover-open")) return;
      try {
        el.hidePopover();
        el.showPopover();
      } catch {
        // Sans effet si la région n'est plus affichable pour une raison inattendue.
      }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["open"], subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        ref={regionRef}
        popover="manual"
        aria-live="polite"
        aria-atomic="true"
        // `display` en style inline : plus prioritaire que n'importe quelle classe, y compris la
        // feuille de style de l'agent utilisateur associée à `[popover]` — sans quoi la classe
        // `flex` ci-dessous resterait active même quand le popover n'est pas ouvert.
        style={toast ? undefined : { display: "none" }}
        // `[popover]` impose par défaut `inset: 0` (donc `top: 0`) et `width/height: fit-content` :
        // sans les neutraliser explicitement (`top-auto`, `w-auto`/`md:w-fit`), le conteneur
        // remonterait collé en haut de l'écran au lieu de suivre `bottom-…` ci-dessous.
        className="pointer-events-none fixed inset-x-4 top-auto bottom-[calc(64px+env(safe-area-inset-bottom)+12px)] z-[70] m-0 w-auto flex justify-center
          border-0 bg-transparent p-0 md:inset-x-auto md:bottom-6 md:left-[calc(var(--k-sidebar-width,16rem)+1.5rem)] md:w-fit md:justify-start print:hidden"
      >
        {toast && <ToastView toast={toast} store={store} />}
      </div>
    </ToastContext.Provider>
  );
}

function getServerSnapshot(): ToastItem | null {
  return null;
}

const toneIcon = {
  success: { Icon: CircleCheck, className: "text-success-soft" },
  error: { Icon: CircleX, className: "text-danger-soft" },
  info: { Icon: Info, className: "text-info-soft" },
} as const;

/**
 * L'enveloppe reste le même nœud quand un toast en remplace un autre : les événements de sortie
 * de survol/focus continuent d'arriver et la minuterie ne reste pas suspendue. Seul le contenu
 * (clé = id) est remonté, ce qui rejoue l'entrée.
 */
function ToastView({ toast, store }: { readonly toast: ToastItem; readonly store: ToastStore }) {
  const { Icon, className: iconClass } = toneIcon[toast.tone];

  return (
    <div
      className="pointer-events-auto w-full md:w-auto md:max-w-[420px]"
      onMouseEnter={() => store.pause()}
      onMouseLeave={() => store.resume()}
      onFocus={() => store.pause()}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) store.resume();
      }}
    >
      <div
        key={toast.id}
        className="flex min-h-12 items-center gap-3 rounded-control bg-ink py-1.5 pl-4 pr-1.5 text-[15px] font-semibold leading-[22px] text-bg shadow-float
          transition-[opacity,translate] duration-200 ease-out starting:translate-y-2 starting:opacity-0"
      >
        <Icon aria-hidden="true" className={`size-5 shrink-0 ${iconClass}`} strokeWidth={1.75} />
        <p className="min-w-0 flex-1 py-1.5">{toast.message}</p>
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              store.dismiss(toast.id);
            }}
            className="inline-flex min-h-9 shrink-0 items-center rounded-control px-3 font-display text-sm font-semibold text-bg underline underline-offset-[3px]
              hover:bg-bg/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bg"
          >
            {toast.action.label}
          </button>
        )}
        <button
          type="button"
          aria-label="Fermer le message"
          title="Fermer"
          onClick={() => store.dismiss(toast.id)}
          className="grid size-9 shrink-0 place-items-center rounded-control text-bg/70 hover:bg-bg/15 hover:text-bg
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bg"
        >
          <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
