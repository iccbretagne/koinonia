"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, Search } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import Breadcrumb from "@/components/Breadcrumb";
import ChurchSwitcher from "@/components/ChurchSwitcher";
import NotificationBell from "@/components/NotificationBell";
import AccountActions, { type AccountActionsProps } from "@/components/AccountActions";
import { useShortcutLabel } from "@/components/shell-state";
import { parentLink, type NavSpace } from "@/lib/navigation";

export interface TopBarUser {
  readonly name: string | null;
  readonly email: string | null;
  readonly image: string | null;
}

interface TopBarProps extends AccountActionsProps {
  readonly spaces: readonly NavSpace[];
  readonly user: TopBarUser;
  readonly churches: { id: string; name: string }[];
  readonly currentChurchId: string | null;
  readonly churchName: string;
  /** `Church.primaryColor` : filet de 3px sous la barre (style inline, exception documentée). */
  readonly churchColor: string;
  readonly onOpenSearch: () => void;
  /** Classe de position collante (`top-0`, ou sous le bandeau de recette). */
  readonly stickyClassName?: string;
}

export function initials(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function Avatar({ user, size }: { readonly user: TopBarUser; readonly size: number }) {
  if (user.image) {
    return (
      <Image src={user.image} alt="" width={size} height={size} className="rounded-full" style={{ width: size, height: size }} />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="grid place-items-center rounded-full bg-brand-soft font-display text-xs font-bold text-brand-text"
    >
      {initials(user.name)}
    </span>
  );
}

/**
 * Menu du compte (avatar) : profil, guide, bascule de vue, déconnexion. Porte l'ancre de visite
 * guidée « header-guide » : le guide s'ouvre depuis ce menu, sur mobile comme sur desktop.
 */
function AccountMenu({ user, ...actions }: AccountActionsProps & { readonly user: TopBarUser }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

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

  return (
    <div ref={rootRef} className="relative" data-tour="header-guide">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Mon compte : profil, guide, déconnexion"
        title="Mon compte"
        className="grid size-11 cursor-pointer place-items-center rounded-full transition-transform duration-120 active:scale-[0.96]
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Avatar user={user} size={32} />
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-card border border-line bg-surface p-1.5 shadow-float"
        >
          <div className="flex items-center gap-3 border-b border-line px-3 pb-3 pt-2">
            <Avatar user={user} size={40} />
            <div className="min-w-0">
              <p className="truncate font-display text-[15px] font-semibold text-ink">{user.name}</p>
              {user.email && <p className="truncate text-[13px] text-ink-muted">{user.email}</p>}
            </div>
          </div>
          <div className="pt-1.5">
            <AccountActions {...actions} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Barre supérieure (docs/design-system/components/TopBar.md) : `surface`, filet `line` et filet de
 * 3px à la couleur de l'église. Desktop : fil d'Ariane, recherche « ⌘K », notifications, compte.
 * Mobile : plumes + nom de l'église (sélecteur) — ou chevron retour vers la page parente sur une
 * page de détail — puis loupe, notifications, compte.
 */
export default function TopBar({
  spaces,
  user,
  churches,
  currentChurchId,
  churchName,
  churchColor,
  onOpenSearch,
  stickyClassName = "top-0",
  ...actions
}: TopBarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const parent = parentLink(spaces, pathname, searchParams.get("dept"));
  const shortcut = useShortcutLabel();

  return (
    <header
      className={`sticky z-30 flex h-14 shrink-0 items-center gap-1 border-b border-line bg-surface pl-3 pr-2 md:gap-2 md:pl-6 md:pr-4 print:hidden ${stickyClassName}`}
    >
      {/* Mobile : identité de l'église, ou retour sur une page de détail */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 md:hidden">
        {parent ? (
          <Link
            href={parent.href}
            className="-ml-1 flex min-h-11 min-w-0 items-center gap-1 rounded-control pr-2 font-display text-[15px] font-semibold text-ink
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <ChevronLeft aria-hidden="true" className="size-6 shrink-0 text-ink-muted" strokeWidth={1.75} />
            <span className="sr-only">Retour à </span>
            <span className="truncate">{parent.label}</span>
          </Link>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG statique */}
            <img src="/brand/icc-plumes.svg" alt="" width={28} height={28} className="h-7 w-auto shrink-0" />
            <ChurchSwitcher
              churches={churches}
              currentChurchId={currentChurchId}
              currentName={churchName}
              color={churchColor}
              variant="topbar"
            />
          </>
        )}
      </div>

      {/* Desktop et tablette : fil d'Ariane */}
      <Breadcrumb spaces={spaces} className="hidden flex-1 md:block" />

      <button
        type="button"
        onClick={onOpenSearch}
        aria-keyshortcuts="Meta+K Control+K"
        className="hidden h-10 w-[min(320px,32vw)] min-w-56 shrink-0 cursor-pointer items-center gap-2 rounded-control bg-surface-sunken px-3 text-left text-sm text-ink-subtle
          transition-colors duration-120 hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:flex"
      >
        <Search aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate">Rechercher…</span>
        <kbd className="rounded-chip border border-line px-1.5 py-0.5 font-sans text-[11px] font-semibold leading-none text-ink-subtle">
          {shortcut}
        </kbd>
      </button>
      <IconButton icon={Search} aria-label="Rechercher" onClick={onOpenSearch} className="md:hidden" />

      <NotificationBell />
      <AccountMenu user={user} {...actions} />

      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -bottom-px h-[3px]"
        style={{ backgroundColor: churchColor }}
      />
    </header>
  );
}
