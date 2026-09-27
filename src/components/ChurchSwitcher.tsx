"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

interface Church {
  id: string;
  name: string;
}

interface ChurchSwitcherProps {
  readonly churches: Church[];
  readonly currentChurchId: string | null;
  /** Nom affiché de l'église courante (repli quand la liste ne la contient pas). */
  readonly currentName: string;
  /** `Church.primaryColor` : pastille de 10px devant le nom (style inline, exception documentée). */
  readonly color: string;
  /** `sidebar` (tête de sidebar), `topbar` (barre mobile), `rail` (pastille seule, menu à droite). */
  readonly variant?: "sidebar" | "topbar" | "rail";
}

/**
 * Sélecteur d'église (docs/design-system/components/TopBar.md) : pastille de couleur + nom. Avec
 * une seule église, simple libellé. Le choix passe par `POST /api/current-church` puis recharge
 * la page (le contexte d'église est lu côté serveur).
 */
export default function ChurchSwitcher({
  churches,
  currentChurchId,
  currentName,
  color,
  variant = "sidebar",
}: ChurchSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const canSwitch = churches.length > 1 && currentChurchId !== null;
  const name = churches.find((c) => c.id === currentChurchId)?.name ?? currentName;

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function choose(churchId: string) {
    if (churchId === currentChurchId) {
      setOpen(false);
      return;
    }
    setPending(churchId);
    await fetch("/api/current-church", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ churchId }),
    });
    window.location.reload();
  }

  const dot = (
    <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
  );

  const labelClass =
    variant === "topbar"
      ? "font-display text-[15px] font-bold leading-5 text-ink"
      : "font-display text-sm font-bold leading-5 text-ink";

  if (!canSwitch) {
    if (variant === "rail") {
      return (
        <span title={name} className="grid size-10 place-items-center rounded-control">
          {dot}
          <span className="sr-only">{name}</span>
        </span>
      );
    }
    return (
      <span className={`flex min-w-0 items-center gap-2 ${variant === "sidebar" ? "px-3 py-2" : ""}`}>
        {dot}
        <span className={`truncate ${labelClass}`}>{name}</span>
      </span>
    );
  }

  const menuPosition =
    variant === "rail" ? "left-full top-0 ml-2" : variant === "topbar" ? "left-0 top-full mt-2" : "left-0 right-0 top-full mt-1";

  return (
    <div ref={rootRef} className={`relative min-w-0 ${variant === "sidebar" ? "" : "flex"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="true"
        title={variant === "rail" ? `${name} — changer d'église` : undefined}
        className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-control text-left transition-colors duration-120 hover:bg-surface-sunken
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
            variant === "rail"
              ? "size-10 justify-center"
              : variant === "topbar"
                ? "min-h-11 max-w-full px-1.5"
                : "min-h-10 w-full px-3"
          }`}
      >
        {dot}
        {variant === "rail" ? (
          <span className="sr-only">{name}, changer d&apos;église</span>
        ) : (
          <>
            <span className={`truncate ${labelClass}`}>{name}</span>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" strokeWidth={1.75} />
            <span className="sr-only">, changer d&apos;église</span>
          </>
        )}
      </button>
      {open && (
        <div
          id={menuId}
          className={`absolute z-50 min-w-60 rounded-card border border-line bg-surface p-1.5 shadow-float ${menuPosition}`}
        >
          <p className="px-3 pb-1 pt-2 font-display text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-subtle">
            Changer d&apos;église
          </p>
          <ul>
            {churches.map((c) => {
              const current = c.id === currentChurchId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => choose(c.id)}
                    disabled={pending !== null}
                    aria-current={current ? "true" : undefined}
                    className={`flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-control px-3 text-left text-[15px] transition-colors duration-120
                      hover:bg-surface-sunken disabled:cursor-wait focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
                        current ? "font-semibold text-brand-text" : "text-ink"
                      }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{pending === c.id ? "Changement…" : c.name}</span>
                    {current && <Check aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
