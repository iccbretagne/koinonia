"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { PERSONA_NAME } from "@/modules/assistant/schemas";
import AssistantAvatar, { type AssistantPersonaKey } from "./AssistantAvatar";

/** Panneau chargé à la première ouverture seulement. */
const AssistantPanel = dynamic(() => import("./AssistantPanel"), { ssr: false });

export const GREETED_KEY = "koinonia-assistant-greeted";
const GREETING_MS = 6000;

export interface AssistantShellProps {
  /** Module actif, assistant activé pour l'instance et non coupé pour l'église. */
  readonly enabled: boolean;
  readonly persona: AssistantPersonaKey;
  readonly firstName: string | null;
}

function readGreeted(): boolean {
  try {
    return window.localStorage.getItem(GREETED_KEY) === "1";
  } catch {
    return true;
  }
}

function markGreeted() {
  try {
    window.localStorage.setItem(GREETED_KEY, "1");
  } catch {
    // Stockage indisponible (navigation privée) : la bulle reviendra, sans gravité.
  }
}

const buttonClasses =
  "relative grid size-11 shrink-0 cursor-pointer place-items-center rounded-full transition-transform duration-120 active:scale-[0.96] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:active:scale-100";

/**
 * Bouton d'aide de la barre du haut (spec 075). Assistant actif : le personnage ouvre le panneau,
 * avec une bulle d'accueil une seule fois par appareil. Sinon (module, instance ou église) : le
 * même bouton mène au guide d'utilisation.
 */
export default function AssistantLauncher({ enabled, persona, firstName }: AssistantShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [greeting, setGreeting] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  const name = PERSONA_NAME[persona];

  useEffect(() => {
    if (!enabled || readGreeted()) return;
    // Petit délai : la bulle apparaît une fois la page affichée, puis plus jamais sur cet appareil.
    const show = setTimeout(() => {
      markGreeted();
      setGreeting(true);
    }, 800);
    const hide = setTimeout(() => setGreeting(false), 800 + GREETING_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [enabled]);

  if (!enabled) {
    return (
      <Link href="/guide" aria-label="Aide : guide d'utilisation" title="Aide" className={`${buttonClasses} text-ink-muted hover:bg-surface-sunken hover:text-ink`}>
        <CircleHelp aria-hidden="true" className="size-5" strokeWidth={1.75} />
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setGreeting(false);
          setLoaded(true);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Aide : demander à ${name}`}
        title={`Demander à ${name}`}
        className={buttonClasses}
      >
        <AssistantAvatar persona={persona} expression="icone" size={34} decorative />
      </button>
      {greeting && (
        <button
          type="button"
          onClick={() => setGreeting(false)}
          className="k-assistant-fade absolute right-0 top-full z-40 mt-2 w-64 cursor-pointer rounded-card bg-ink px-3.5 py-2.5 text-left text-sm
            text-bg shadow-float"
        >
          Bonjour{firstName ? ` ${firstName}` : ""} ! Je suis {name}. Une question sur Koinonia ? Touchez-moi.
        </button>
      )}
      {loaded && open && (
        <AssistantPanel persona={persona} firstName={firstName} screen={pathname} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
