"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { PERSONA_NAME } from "@/modules/assistant/schemas";
import AssistantAvatar, { type AssistantPersonaKey } from "./AssistantAvatar";

/** Panneau chargé à la première ouverture seulement. */
const AssistantPanel = dynamic(() => import("./AssistantPanel"), { ssr: false });

export const GREETED_KEY = "koinonia-assistant-greeted";
export const MINIMIZED_KEY = "koinonia-assistant-minimized";
/** Barres ancrées en bas d'écran (actions groupées, enregistrement, lecteur) : la bulle passe au-dessus. */
export const BOTTOM_BAR_ATTRIBUTE = "data-k-bottom-bar";
const GREETING_MS = 6000;

/** Écrans de terrain plein écran (contrôle d'entrée, restauration) : pas de bulle. */
const HIDDEN_ON = [/^\/billetterie\/[^/]+\/(controle|restauration)(\/|$)/];

export interface AssistantShellProps {
  /** Module actif, assistant activé pour l'instance et non coupé pour l'église. */
  readonly enabled: boolean;
  readonly persona: AssistantPersonaKey;
  readonly firstName: string | null;
}

function readStorage(storage: "local" | "session", key: string): boolean {
  try {
    return (storage === "local" ? window.localStorage : window.sessionStorage).getItem(key) === "1";
  } catch {
    return storage === "local";
  }
}

function writeStorage(storage: "local" | "session", key: string, value: boolean) {
  try {
    const target = storage === "local" ? window.localStorage : window.sessionStorage;
    if (value) target.setItem(key, "1");
    else target.removeItem(key);
  } catch {
    // Stockage indisponible (navigation privée) : sans gravité.
  }
}

/** Une barre ancrée en bas est affichée : suivi par observation du document. */
function subscribeBottomBar(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
const hasBottomBar = () => document.querySelector(`[${BOTTOM_BAR_ATTRIBUTE}]`) !== null;

/**
 * Bulle de l'assistant (spec 075), en bas à droite de chaque écran connecté : sur téléphone,
 * au-dessus de la barre du bas ; au-dessus aussi de toute barre ancrée en bas. Une bulle
 * d'accueil une seule fois par appareil ; « × » la réduit en languette pour la session.
 * Assistant inactif (module, instance ou église) : rien ne flotte, le guide reste dans le menu
 * du compte.
 */
export default function AssistantLauncher({ enabled, persona, firstName }: AssistantShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [greeting, setGreeting] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  const lifted = useSyncExternalStore(subscribeBottomBar, hasBottomBar, () => false);
  const name = PERSONA_NAME[persona];
  const hidden = HIDDEN_ON.some((re) => re.test(pathname));

  useEffect(() => {
    if (!enabled) return;
    const restore = setTimeout(() => setMinimized(readStorage("session", MINIMIZED_KEY)), 0);
    if (readStorage("local", GREETED_KEY)) return () => clearTimeout(restore);
    // Petit délai : la bulle apparaît une fois la page affichée, puis plus jamais sur cet appareil.
    const show = setTimeout(() => {
      writeStorage("local", GREETED_KEY, true);
      setGreeting(true);
    }, 800);
    const hide = setTimeout(() => setGreeting(false), 800 + GREETING_MS);
    return () => {
      clearTimeout(restore);
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [enabled]);

  if (!enabled || hidden) return null;

  function openPanel() {
    setGreeting(false);
    setMinimized(false);
    writeStorage("session", MINIMIZED_KEY, false);
    setLoaded(true);
    setOpen(true);
  }

  function minimize() {
    setGreeting(false);
    setMinimized(true);
    writeStorage("session", MINIMIZED_KEY, true);
  }

  const bottom = lifted
    ? "bottom-[calc(64px+env(safe-area-inset-bottom)+80px)] md:bottom-24"
    : "bottom-[calc(64px+env(safe-area-inset-bottom)+16px)] md:bottom-6";

  return (
    <div data-assistant-launcher className={`fixed right-0 z-40 transition-[bottom] duration-200 print:hidden ${bottom}`}>
      {minimized ? (
        <button
          type="button"
          onClick={openPanel}
          aria-label={`Aide : demander à ${name}`}
          title={`Demander à ${name}`}
          className="flex h-12 cursor-pointer items-center rounded-l-full border border-r-0 border-line bg-surface py-1 pl-1.5 pr-2 shadow-float
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <AssistantAvatar persona={persona} expression="icone" size={36} decorative float={false} />
        </button>
      ) : (
        <div className="relative mr-4 md:mr-6">
          {greeting && (
            <button
              type="button"
              onClick={openPanel}
              className="k-assistant-fade absolute bottom-full right-0 mb-3 w-64 cursor-pointer rounded-card bg-ink px-3.5 py-2.5 text-left text-sm
                text-bg shadow-float"
            >
              Bonjour{firstName ? ` ${firstName}` : ""} ! Je suis {name}. Une question sur Koinonia ? Touchez-moi.
            </button>
          )}
          <button
            type="button"
            onClick={openPanel}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={`Aide : demander à ${name}`}
            title={`Demander à ${name}`}
            className="grid size-14 cursor-pointer place-items-center rounded-full bg-surface shadow-float ring-1 ring-line transition-transform
              duration-120 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:active:scale-100"
          >
            <AssistantAvatar persona={persona} expression="icone" size={52} decorative />
          </button>
          <button
            type="button"
            onClick={minimize}
            aria-label={`Réduire ${name}`}
            title="Réduire"
            className="absolute -left-2 -top-2 grid size-6 cursor-pointer place-items-center rounded-full border border-line bg-surface text-ink-muted
              shadow-card hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <X aria-hidden="true" className="size-3.5" strokeWidth={2} />
          </button>
        </div>
      )}
      {loaded && open && (
        <AssistantPanel persona={persona} firstName={firstName} screen={pathname} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
