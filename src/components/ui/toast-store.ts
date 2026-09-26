/**
 * État des toasts, indépendant de React pour être testable sans DOM
 * (docs/design-system/components/Toast.md) : un seul toast à la fois (le suivant remplace le
 * précédent), 4 s d'affichage (6 s avec une action), minuterie suspendue tant que le toast est
 * survolé ou focalisé.
 */

export type ToastTone = "success" | "error" | "info";

export interface ToastAction {
  /** Verbe court (« Annuler », « Voir »). */
  readonly label: string;
  readonly onClick: () => void;
}

export interface ToastOptions {
  readonly action?: ToastAction;
  /** Durée d'affichage en ms ; défaut 4000, ou 6000 avec une action. */
  readonly duration?: number;
}

export interface ToastItem {
  readonly id: number;
  readonly tone: ToastTone;
  readonly message: string;
  readonly action?: ToastAction;
  readonly duration: number;
}

export const TOAST_DURATION_MS = 4000;
export const TOAST_WITH_ACTION_DURATION_MS = 6000;

export function toastDuration(options?: ToastOptions): number {
  if (options?.duration !== undefined) return options.duration;
  return options?.action ? TOAST_WITH_ACTION_DURATION_MS : TOAST_DURATION_MS;
}

export interface ToastClock {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  now: () => number;
}

const defaultClock: ToastClock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export interface ToastStore {
  /** Affiche un toast (remplace celui en cours) et renvoie son identifiant. */
  show(tone: ToastTone, message: string, options?: ToastOptions): number;
  /** Ferme le toast `id`, ou le toast en cours sans argument. Sans effet si `id` a déjà été remplacé. */
  dismiss(id?: number): void;
  /** Suspend la minuterie (survol, focus). */
  pause(): void;
  /** Reprend la minuterie avec le temps restant. */
  resume(): void;
  getSnapshot(): ToastItem | null;
  subscribe(listener: () => void): () => void;
}

export function createToastStore(clock: ToastClock = defaultClock): ToastStore {
  let current: ToastItem | null = null;
  let nextId = 1;
  let timer: unknown = null;
  let remaining = 0;
  let startedAt = 0;
  let paused = false;
  const listeners = new Set<() => void>();

  function emit() {
    for (const listener of listeners) listener();
  }

  function clearTimer() {
    if (timer !== null) {
      clock.clearTimeout(timer);
      timer = null;
    }
  }

  function startTimer(ms: number) {
    clearTimer();
    remaining = ms;
    startedAt = clock.now();
    const id = current?.id;
    timer = clock.setTimeout(() => {
      timer = null;
      store.dismiss(id);
    }, ms);
  }

  const store: ToastStore = {
    show(tone, message, options) {
      const item: ToastItem = {
        id: nextId++,
        tone,
        message,
        action: options?.action,
        duration: toastDuration(options),
      };
      current = item;
      // Un nouveau toast repart pour sa durée complète, même si le précédent était survolé :
      // `paused` est conservé, la minuterie démarrera à la sortie du survol.
      remaining = item.duration;
      if (paused) clearTimer();
      else startTimer(item.duration);
      emit();
      return item.id;
    },
    dismiss(id) {
      if (!current || (id !== undefined && current.id !== id)) return;
      clearTimer();
      current = null;
      paused = false;
      emit();
    },
    pause() {
      if (paused) return;
      paused = true;
      if (timer !== null) {
        remaining = Math.max(0, remaining - (clock.now() - startedAt));
        clearTimer();
      }
    },
    resume() {
      if (!paused) return;
      paused = false;
      if (current) startTimer(remaining);
    },
    getSnapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return store;
}
