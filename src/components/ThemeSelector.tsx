"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "koinonia-theme";

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
  { value: "system", label: "Système", icon: Monitor },
];

function applyToDocument(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/**
 * Choix du thème (spec 055) : stocké dans le navigateur uniquement — aucune donnée serveur.
 * Le script inline de `src/app/layout.tsx` réapplique ce choix avant le premier rendu.
 */
export default function ThemeSelector() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    setChoice(readChoice());
  }, []);

  function apply(next: ThemeChoice) {
    setChoice(next);
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Stockage indisponible (navigation privée) : le choix s'applique pour cette page seulement.
    }
    applyToDocument(next);
  }

  return (
    <div role="radiogroup" aria-label="Thème" className="inline-flex gap-1 rounded-control bg-surface-sunken p-1">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => apply(value)}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-[8px] px-3 font-display text-sm font-semibold transition-colors ${
              active ? "bg-surface text-brand-text shadow-card" : "text-ink-muted hover:text-ink"
            }`}
          >
            <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
