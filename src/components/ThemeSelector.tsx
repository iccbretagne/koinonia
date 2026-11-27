"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import SegmentedControl from "@/components/ui/SegmentedControl";

type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "koinonia-theme";

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
  { value: "system", label: "Système", icon: Monitor },
];

function applyToDocument(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
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
// Abonnés locaux : `storage` ne se déclenche que pour les autres onglets.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function apply(next: ThemeChoice) {
  try {
    if (next === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Stockage indisponible (navigation privée) : le choix s'applique pour cette page seulement.
  }
  applyToDocument(next);
  listeners.forEach((listener) => listener());
}

export default function ThemeSelector() {
  const choice = useSyncExternalStore(subscribe, readChoice, () => "system" as ThemeChoice);

  return (
    <SegmentedControl
      label="Thème"
      value={choice}
      onChange={apply}
      options={OPTIONS.map(({ value, label, icon: Icon }) => ({
        value,
        label: (
          <span className="inline-flex items-center gap-2">
            <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
            {label}
          </span>
        ),
      }))}
    />
  );
}
