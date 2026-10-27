/**
 * Fenêtre d'installation native (spec 070). Le navigateur émet `beforeinstallprompt` une seule
 * fois, tôt dans le chargement : l'événement est capturé dès le root layout et gardé ici, pour
 * la page d'installation, la carte d'Accueil et le menu du compte.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallPromptSnapshot {
  /** L'installation native peut être proposée. */
  readonly canPrompt: boolean;
  /** L'application vient d'être installée depuis cette page. */
  readonly installed: boolean;
}

const EMPTY: InstallPromptSnapshot = { canPrompt: false, installed: false };

let deferred: BeforeInstallPromptEvent | null = null;
let snapshot: InstallPromptSnapshot = EMPTY;
let armed = false;
const listeners = new Set<() => void>();

function update(next: InstallPromptSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

/** Écoute les événements d'installation ; sans effet au-delà du premier appel. */
export function armInstallPrompt(target: Pick<Window, "addEventListener"> = globalThis as unknown as Window) {
  if (armed) return;
  armed = true;
  target.addEventListener("beforeinstallprompt", (event: Event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    update({ canPrompt: true, installed: snapshot.installed });
  });
  target.addEventListener("appinstalled", () => {
    deferred = null;
    update({ canPrompt: false, installed: true });
  });
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getInstallPromptSnapshot(): InstallPromptSnapshot {
  return snapshot;
}

export function getServerInstallPromptSnapshot(): InstallPromptSnapshot {
  return EMPTY;
}

/** Ouvre la fenêtre d'installation du système. Le navigateur n'en accepte qu'une par événement. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferred;
  if (!event) return "unavailable";
  deferred = null;
  update({ canPrompt: false, installed: snapshot.installed });
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") update({ canPrompt: false, installed: true });
  return outcome;
}

/** Réservé aux tests. */
export function resetInstallPromptStore() {
  deferred = null;
  snapshot = EMPTY;
  armed = false;
  listeners.clear();
}
