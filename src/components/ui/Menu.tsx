"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import BottomSheet from "./BottomSheet";
import IconButton from "./IconButton";
import { rovingIndex } from "./roving";

export interface MenuItem {
  /** Verbe à l'infinitif (« Changer l'échéance »). */
  readonly label: string;
  /** Action ; ignorée si `href` est fourni. */
  readonly onSelect?: () => void;
  /** Lien interne (`next/link`). */
  readonly href?: string;
  readonly icon?: LucideIcon;
  /** `danger` : action destructive (texte `danger`), à confirmer ensuite dans un `Dialog`. */
  readonly tone?: "default" | "danger";
  readonly disabled?: boolean;
}

interface MenuProps {
  /** Nom du déclencheur et titre de la feuille mobile (« Autres actions pour Marie Kouassi »). */
  readonly label: string;
  readonly items: readonly MenuItem[];
  /** Bord du déclencheur auquel la liste s'aligne sur desktop. */
  readonly align?: "start" | "end";
  /** `sm` = 44 px sur mobile puis 36 px (ligne de tableau desktop). */
  readonly size?: "sm" | "md";
  readonly className?: string;
}

const DESKTOP_QUERY = "(min-width: 768px)";
const MENU_GAP = 4;

/** Vrai à partir de 768 px (liste ancrée) ; faux sur mobile (feuille du bas). */
function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

/** Position fixe de la liste sous (ou au-dessus de) son déclencheur, dans la fenêtre. */
export function menuPosition(
  trigger: { top: number; bottom: number; left: number; right: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  align: "start" | "end",
): { top: number; left: number } {
  const below = trigger.bottom + MENU_GAP;
  const top = below + menu.height > viewport.height && trigger.top - MENU_GAP - menu.height >= 0
    ? trigger.top - MENU_GAP - menu.height
    : below;
  const rawLeft = align === "end" ? trigger.right - menu.width : trigger.left;
  const left = Math.max(8, Math.min(rawLeft, viewport.width - menu.width - 8));
  return { top, left };
}

const itemClasses = (tone: MenuItem["tone"]) =>
  `flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-[15px] leading-[22px]
   focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus
   aria-disabled:cursor-not-allowed aria-disabled:opacity-45 ${
     tone === "danger" ? "text-danger hover:bg-danger-soft" : "text-ink hover:bg-surface-sunken"
   } md:min-h-10`;

/**
 * Menu d'actions « ⋯ » (docs/design-system/components/Menu.md) : un `IconButton` ouvre la liste
 * des actions secondaires d'une ligne ou d'une page (l'action principale reste visible à côté).
 * Desktop : liste ancrée au déclencheur (`shadow-float`, `z-overlay`), fermée par Échap, Tab, un
 * clic extérieur ou le défilement. Mobile : feuille du bas (`BottomSheet`), comme le menu « Plus ».
 * Clavier : `role="menu"`/`menuitem`, flèches haut/bas, Début, Fin ; le focus revient au déclencheur.
 */
export default function Menu({ label, items, align = "end", size = "md", className = "" }: Readonly<MenuProps>) {
  const [open, setOpen] = useState(false);
  const [initialFocus, setInitialFocus] = useState<"first" | "last">("first");
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const desktop = useIsDesktop();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setPosition(null);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const focusItem = useCallback((index: number) => {
    listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[index]?.focus({ preventScroll: true });
  }, []);

  // Desktop : position fixe calculée à l'ouverture (la liste n'est pas coupée par un tableau défilant).
  useLayoutEffect(() => {
    if (!open || !desktop) return;
    const trigger = triggerRef.current?.getBoundingClientRect();
    const list = listRef.current;
    if (!trigger || !list) return;
    setPosition(
      menuPosition(trigger, { width: list.offsetWidth, height: list.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }, align),
    );
  }, [open, desktop, align]);

  useEffect(() => {
    if (!open) return;
    focusItem(initialFocus === "first" ? 0 : items.length - 1);
  }, [open, initialFocus, focusItem, items.length, position]);

  useEffect(() => {
    if (!open || !desktop) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (listRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    const onScroll = (e: Event) => {
      if (listRef.current?.contains(e.target as Node)) return;
      close(false);
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, desktop, close]);

  function openWith(focus: "first" | "last") {
    setInitialFocus(focus);
    setOpen(true);
  }

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      openWith("first");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openWith("last");
    }
  }

  function onListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const nodes = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const current = nodes.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key === "Tab") {
      if (desktop) close(false);
      return;
    }
    const next = rovingIndex(Math.max(current, 0), e.key, items.map((i) => Boolean(i.disabled)), "vertical");
    if (next !== null) {
      e.preventDefault();
      focusItem(next);
    }
  }

  function select(item: MenuItem) {
    if (item.disabled) return;
    close(!item.href);
    item.onSelect?.();
  }

  const list = (
    <div
      ref={listRef}
      id={menuId}
      role="menu"
      aria-label={label}
      aria-orientation="vertical"
      onKeyDown={onListKeyDown}
      className={
        desktop
          ? "fixed z-overlay min-w-52 max-w-[min(20rem,calc(100vw-16px))] rounded-card border border-line bg-surface p-1.5 shadow-float"
          : "flex flex-col"
      }
      style={desktop ? (position ? { top: position.top, left: position.left } : { visibility: "hidden", top: 0, left: 0 }) : undefined}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const content = (
          <>
            {Icon && <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />}
            <span className="min-w-0">{item.label}</span>
          </>
        );
        if (item.href && !item.disabled) {
          return (
            <Link key={item.label} href={item.href} role="menuitem" tabIndex={-1} className={itemClasses(item.tone)} onClick={() => select(item)}>
              {content}
            </Link>
          );
        }
        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-disabled={item.disabled || undefined}
            className={`${itemClasses(item.tone)} cursor-pointer`}
            onClick={() => select(item)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <IconButton
        ref={triggerRef}
        icon={MoreHorizontal}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        size={size}
        className={className}
        onClick={() => (open ? close(false) : openWith("first"))}
        onKeyDown={onTriggerKeyDown}
      />
      {open && desktop && list}
      {open && !desktop && (
        <BottomSheet open onClose={() => close(true)} title={label}>
          {list}
        </BottomSheet>
      )}
    </>
  );
}
